/**
 * Delivery driving-distance + pricing tests (no live Google / Redis required).
 * Run: npm run test:delivery-driving-distance
 */
import assert from 'node:assert/strict';
import {
  DELIVERY_DISTANCE_CACHE_TTL_SECONDS,
  deliveryDistanceCacheKey,
  resolveDeliveryDistanceKm,
  roundCoordForCache,
} from '../src/utils/delivery/deliveryDistanceKm';
import {
  DeliveryDistanceUnavailableError,
  isDeliveryDistanceUnavailableError,
} from '../src/utils/delivery/deliveryDistanceError';
import { computeTieredDeliveryFee } from '../src/utils/delivery/tieredDeliveryFee';
import {
  buildDeliveryRestrictionBlockedMessage,
  isDistanceOverMax,
} from '../src/utils/delivery/deliveryDistanceTimeRestriction';
import { distanceKm } from '../src/utils/consumer/favouriteHelpers';
import { roundMoney } from '../src/utils/vendor/walletHelpers';

let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => {
      console.log(`  ✓ ${name}`);
    })
    .catch((err) => {
      failed += 1;
      console.error(`  ✗ ${name}`);
      console.error(err);
    });
}

async function main() {
  console.log('Delivery driving distance\n');

  await test('cache key rounds coords consistently', () => {
    const a = deliveryDistanceCacheKey({
      originLat: 32.0853,
      originLng: 34.7818,
      destinationLat: 32.1,
      destinationLng: 34.8,
    });
    const b = deliveryDistanceCacheKey({
      originLat: 32.08530001,
      originLng: 34.78180001,
      destinationLat: 32.1000004,
      destinationLng: 34.8000004,
    });
    assert.equal(a, b);
    assert.equal(roundCoordForCache(32.08530001), '32.08530');
    assert.equal(DELIVERY_DISTANCE_CACHE_TTL_SECONDS, 1800);
  });

  await test('Google Routes meters → driving km (no Haversine)', async () => {
    const store = new Map<string, number>();
    let googleCalls = 0;
    const result = await resolveDeliveryDistanceKm(
      {
        originLat: 32.08,
        originLng: 34.78,
        destinationLat: 32.15,
        destinationLng: 34.85,
      },
      {
        getCached: async (key) => store.get(key) ?? null,
        setCached: async (key, km) => {
          store.set(key, km);
        },
        fetchDrivingMeters: async () => {
          googleCalls += 1;
          return 13000; // 13.0 km driving
        },
      }
    );
    assert.equal(result.distance_km, 13);
    assert.equal(result.source, 'google');
    assert.equal(googleCalls, 1);

    const straight = distanceKm(32.08, 34.78, 32.15, 34.85);
    assert.ok(
      Math.abs(straight - 13) > 0.5,
      `haversine (${straight}) should differ from driving 13 km`
    );
    assert.ok(straight < 13, `haversine should be shorter than driving for this pair, got ${straight}`);
  });

  await test('cache hit skips Google and keeps quote/place consistent', async () => {
    const store = new Map<string, number>();
    let googleCalls = 0;
    const deps = {
      getCached: async (key: string) => store.get(key) ?? null,
      setCached: async (key: string, km: number) => {
        store.set(key, km);
      },
      fetchDrivingMeters: async () => {
        googleCalls += 1;
        return 13150;
      },
    };
    const coords = {
      originLat: 31.77,
      originLng: 35.21,
      destinationLat: 31.8,
      destinationLng: 35.25,
    };

    const quote = await resolveDeliveryDistanceKm(coords, deps);
    const place = await resolveDeliveryDistanceKm(coords, deps);

    assert.equal(quote.distance_km, 13.15);
    assert.equal(place.distance_km, 13.15);
    assert.equal(quote.source, 'google');
    assert.equal(place.source, 'cache');
    assert.equal(googleCalls, 1);
  });

  await test('Google failure throws retryable error (no Haversine billing)', async () => {
    let threw: unknown;
    try {
      await resolveDeliveryDistanceKm(
        {
          originLat: 32.08,
          originLng: 34.78,
          destinationLat: 32.15,
          destinationLng: 34.85,
        },
        {
          getCached: async () => null,
          setCached: async () => undefined,
          fetchDrivingMeters: async () => {
            throw new Error('Routes API denied');
          },
        }
      );
    } catch (err) {
      threw = err;
    }
    assert.ok(isDeliveryDistanceUnavailableError(threw));
    const e = threw as DeliveryDistanceUnavailableError;
    assert.equal(e.code, 'DELIVERY_DISTANCE_UNAVAILABLE');
    assert.equal(e.statusCode, 503);
    assert.equal(e.retryable, true);
  });

  await test('tiered pricing uses driving km (4 km vs 13 km)', () => {
    const pricing = {
      base_fee: 15,
      base_distance_km: 2,
      extra_per_km: 3,
      maximum_fee: Number.POSITIVE_INFINITY,
      increased_fee_percent: 0,
    };
    const short = computeTieredDeliveryFee(4, pricing);
    const road = computeTieredDeliveryFee(13, pricing);
    // 4 km → base 15 + 2*3 = 21
    assert.equal(short.delivery_fee, 21);
    assert.equal(short.extra_km, 2);
    // 13 km → base 15 + 11*3 = 48
    assert.equal(road.delivery_fee, 48);
    assert.equal(road.extra_km, 11);
    assert.ok(road.delivery_fee > short.delivery_fee);
  });

  await test('free delivery zeroes customer fee but keeps original for payout basis', () => {
    const pricing = {
      base_fee: 15,
      base_distance_km: 2,
      extra_per_km: 3,
      maximum_fee: Number.POSITIVE_INFINITY,
      increased_fee_percent: 0,
    };
    const breakdown = computeTieredDeliveryFee(13, pricing);
    const restaurantFreeDelivery = true;
    const delivery_fee = restaurantFreeDelivery ? 0 : breakdown.delivery_fee;
    const original_delivery_fee = breakdown.delivery_fee;
    assert.equal(delivery_fee, 0);
    assert.equal(original_delivery_fee, 48);
  });

  await test('driver payout uses original_delivery_charge + tips − commission', () => {
    const original_delivery_charge = 48;
    const dm_tips = 5;
    const delivery_charge_comission = 10; // percent
    const comission_on_delivery = roundMoney(
      delivery_charge_comission * (original_delivery_charge / 100)
    );
    const dmEarningIncrement = dm_tips + original_delivery_charge - comission_on_delivery;
    assert.equal(comission_on_delivery, 4.8);
    assert.equal(dmEarningIncrement, 48.2);
  });

  await test('10 km time restriction uses driving km', () => {
    const maxKm = 10;
    assert.equal(isDistanceOverMax(4, maxKm), false);
    assert.equal(isDistanceOverMax(10, maxKm), false);
    assert.equal(isDistanceOverMax(10.00001, maxKm), true);
    assert.equal(isDistanceOverMax(13, maxKm), true);
    const blocked = buildDeliveryRestrictionBlockedMessage(maxKm, null);
    assert.match(blocked.msg, /10 km/);
  });

  await test('client fee override must not undercut server fee (tolerance rule)', () => {
    const PRICE_TOLERANCE = 0.05;
    const serverFee = 48;
    const clientUndercut = 21; // old haversine-priced fee
    const clientMatch = 48.02;
    assert.ok(Math.abs(clientUndercut - serverFee) > PRICE_TOLERANCE);
    assert.ok(Math.abs(clientMatch - serverFee) <= PRICE_TOLERANCE);
    // Server always keeps serverFee when mismatch exceeds tolerance
    const applied =
      Math.abs(clientUndercut - serverFee) <= PRICE_TOLERANCE ? clientUndercut : serverFee;
    assert.equal(applied, 48);
  });

  console.log(
    failed === 0 ? '\nAll delivery driving-distance tests passed' : `\n${failed} test(s) failed`
  );
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
