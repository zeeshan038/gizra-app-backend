import prisma from '../../../config/database';
import {
  RestaurantSetupUpdateBody,
  VendorRestaurantRow,
  VendorSetupActionError,
} from '../../../types/vendor/restaurantSetup';
import { ensureRestaurantConfig, selfDeliveryEnabled } from './loadRestaurant';
import { syncRestaurantRelationNames } from './syncNames';

export async function applyRestaurantSetupFields(
  restaurant: VendorRestaurantRow,
  body: RestaurantSetupUpdateBody
): Promise<VendorSetupActionError | null> {
  const rid = Number(restaurant.id);
  const selfDelivery = await selfDeliveryEnabled(restaurant, rid);
  const config = await ensureRestaurantConfig(rid);

  if (config.dine_in && body.schedule_advance_dine_in_booking_duration != null) {
    const amount = body.schedule_advance_dine_in_booking_duration;
    const format = body.schedule_advance_dine_in_booking_duration_time_format || 'min';
    if (format === 'min' && amount > 60) {
      return { status: 400, msg: 'Dine-in booking duration must be within 60 minutes' };
    }
    if (format === 'hour' && amount > 24) {
      return { status: 400, msg: 'Dine-in booking duration must be within 24 hours' };
    }
    if (format === 'day' && amount > 365) {
      return { status: 400, msg: 'Dine-in booking duration must be within 365 days' };
    }
  }

  if (selfDelivery && body.maximum_shipping_charge != null && body.minimum_delivery_charge != null) {
    if (body.maximum_shipping_charge <= body.minimum_delivery_charge) {
      return {
        status: 400,
        msg: 'Maximum delivery charge must be greater than the minimum delivery charge',
      };
    }
  }

  const restaurantData: Record<string, unknown> = {
    minimum_order: body.minimum_order,
    gst: JSON.stringify({ status: body.gst_status ? 1 : 0, code: body.gst_code || '' }),
    updated_at: new Date(),
  };

  if (selfDelivery) {
    restaurantData.minimum_shipping_charge = body.minimum_delivery_charge ?? 0;
    restaurantData.per_km_shipping_charge = body.per_km_delivery_charge ?? 0;
    restaurantData.maximum_shipping_charge = body.maximum_shipping_charge ?? null;
    restaurantData.free_delivery_distance = JSON.stringify({
      status: body.free_delivery_distance_status ? 1 : 0,
      value: body.free_delivery_distance || '',
    });
  }

  await prisma.restaurants.update({
    where: { id: restaurant.id },
    data: restaurantData,
  });

  await prisma.cuisine_restaurant.deleteMany({ where: { restaurant_id: rid } });
  const cuisineIds = Array.from(new Set<number>(body.cuisine_ids || []));
  if (cuisineIds.length) {
    const existingCuisines = await prisma.cuisines.findMany({
      where: { id: { in: cuisineIds.map((id: number) => BigInt(id)) }, status: true },
      select: { id: true },
    });
    if (existingCuisines.length) {
      await prisma.cuisine_restaurant.createMany({
        data: existingCuisines.map((row) => ({
          restaurant_id: rid,
          cuisine_id: Number(row.id),
        })),
      });
    }
  }

  await syncRestaurantRelationNames(
    body.tags || [],
    async (name) => {
      const found = await prisma.tags.findFirst({ where: { tag: name } });
      if (found) return found.id;
      const created = await prisma.tags.create({
        data: { tag: name, created_at: new Date(), updated_at: new Date() },
      });
      return created.id;
    },
    async (ids) => {
      await prisma.restaurant_tag.deleteMany({ where: { restaurant_id: rid } });
      if (!ids.length) return;
      await prisma.restaurant_tag.createMany({
        data: ids.map((id) => ({ restaurant_id: rid, tag_id: Number(id) })),
      });
    }
  );

  await syncRestaurantRelationNames(
    (body.characteristics || []).slice(0, 5),
    async (name) => {
      const found = await prisma.characteristics.findFirst({ where: { characteristic: name } });
      if (found) return found.id;
      const created = await prisma.characteristics.create({
        data: { characteristic: name, created_at: new Date(), updated_at: new Date() },
      });
      return created.id;
    },
    async (ids) => {
      await prisma.characteristic_restaurant.deleteMany({ where: { restaurant_id: rid } });
      if (!ids.length) return;
      await prisma.characteristic_restaurant.createMany({
        data: ids.map((id) => ({ restaurant_id: rid, characteristic_id: Number(id) })),
      });
    }
  );

  await prisma.restaurant_configs.update({
    where: { id: config.id },
    data: {
      customer_order_date: body.customer_order_date ?? config.customer_order_date,
      extra_packaging_status: body.extra_packaging_status ?? config.extra_packaging_status,
      extra_packaging_amount:
        body.extra_packaging_amount === undefined
          ? config.extra_packaging_amount
          : body.extra_packaging_amount,
      schedule_advance_dine_in_booking_duration:
        body.schedule_advance_dine_in_booking_duration ??
        config.schedule_advance_dine_in_booking_duration,
      schedule_advance_dine_in_booking_duration_time_format:
        body.schedule_advance_dine_in_booking_duration_time_format ||
        config.schedule_advance_dine_in_booking_duration_time_format,
      updated_at: new Date(),
    },
  });

  return null;
}
