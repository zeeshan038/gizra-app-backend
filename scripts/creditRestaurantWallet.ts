/**
 * Credit restaurant wallet + seed delivered digital orders for withdraw testing.
 *
 * Usage:
 *   npx ts-node scripts/creditRestaurantWallet.ts
 *   npx ts-node scripts/creditRestaurantWallet.ts --email=restaurant9339@gizra.com --amount=500 --orders=3
 *
 * Digital (non-COD) credits go to total_earning without collected_cash,
 * so withdrawable balance increases immediately.
 */
import dotenv from 'dotenv';
import path from 'path';
import { Prisma } from '@prisma/client';
import prisma from '../src/config/database';
import {
  computeRestaurantWalletBalance,
  decimalToNumber,
  roundMoney,
  toDecimal,
} from '../src/utils/vendor/walletHelpers';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const EMAIL = arg('email', 'restaurant9339@gizra.com');
const TARGET_AMOUNT = Math.max(1, Number(arg('amount', '500')) || 500);
const ORDER_COUNT = Math.max(1, Math.min(10, Number(arg('orders', '3')) || 3));

function dec(n: number | string | bigint): Prisma.Decimal {
  return new Prisma.Decimal(n.toString());
}

async function ensureWallet(vendorId: number) {
  const vid = toDecimal(vendorId);
  let wallet = await prisma.restaurant_wallets.findFirst({ where: { vendor_id: vid } });
  if (!wallet) {
    wallet = await prisma.restaurant_wallets.create({
      data: {
        vendor_id: vid,
        total_earning: 0,
        total_withdrawn: 0,
        pending_withdraw: 0,
        collected_cash: 0,
        created_at: new Date(),
        updated_at: new Date(),
      },
    });
  }
  return wallet;
}

function printWallet(label: string, wallet: Awaited<ReturnType<typeof ensureWallet>>) {
  const totalEarning = decimalToNumber(wallet.total_earning);
  const totalWithdrawn = decimalToNumber(wallet.total_withdrawn);
  const pendingWithdraw = decimalToNumber(wallet.pending_withdraw);
  const collectedCash = decimalToNumber(wallet.collected_cash);
  const balance = Math.max(
    0,
    computeRestaurantWalletBalance({
      total_earning: totalEarning,
      total_withdrawn: totalWithdrawn,
      pending_withdraw: pendingWithdraw,
      collected_cash: collectedCash,
    })
  );
  console.log(`\n${label}`);
  console.log(`  total_earning     : ${roundMoney(totalEarning)}`);
  console.log(`  collected_cash    : ${roundMoney(collectedCash)}`);
  console.log(`  pending_withdraw  : ${roundMoney(pendingWithdraw)}`);
  console.log(`  total_withdrawn   : ${roundMoney(totalWithdrawn)}`);
  console.log(`  withdrawable      : ${roundMoney(balance)}`);
}

async function resolveVendorAndRestaurant(email: string) {
  let vendor = await prisma.vendors.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
  });

  let restaurant = vendor
    ? await prisma.restaurants.findFirst({
        where: { vendor_id: Number(vendor.id) },
        orderBy: { id: 'asc' },
      })
    : null;

  if (!restaurant) {
    restaurant = await prisma.restaurants.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      orderBy: { id: 'asc' },
    });
    if (restaurant) {
      vendor = await prisma.vendors.findFirst({
        where: { id: BigInt(Number(restaurant.vendor_id)) },
      });
    }
  }

  // Fallback: restaurant that owns the same demo menu (Smoothie / Fresh Juice / …)
  if (!vendor || !restaurant) {
    const smoothie = await prisma.food.findFirst({
      where: { name: { equals: 'Smoothie', mode: 'insensitive' }, status: true },
      orderBy: { id: 'desc' },
    });
    if (smoothie) {
      restaurant = await prisma.restaurants.findFirst({
        where: { id: BigInt(Number(smoothie.restaurant_id)) },
      });
      if (restaurant) {
        vendor = await prisma.vendors.findFirst({
          where: { id: BigInt(Number(restaurant.vendor_id)) },
        });
        console.warn(
          `Email ${email} not found. Falling back to restaurant with matching menu: ${restaurant.name} (${vendor?.email})`
        );
      }
    }
  }

  if (!vendor || !restaurant) {
    const vendors = await prisma.vendors.findMany({
      take: 20,
      orderBy: { id: 'desc' },
      select: { id: true, email: true },
    });
    const list = vendors.map((v) => `  #${Number(v.id)} ${v.email}`).join('\n');
    throw new Error(
      `Vendor/restaurant not found for ${email}.\nExisting vendors:\n${list}\n\nRe-run with --email=<one of the above>`
    );
  }

  return { vendor, restaurant };
}

async function main() {
  console.log(`Looking up: ${EMAIL}`);

  const { vendor, restaurant } = await resolveVendorAndRestaurant(EMAIL);

  const restaurantIdNum = Number(restaurant.id);
  const vendorIdNum = Number(vendor.id);

  console.log(
    `Vendor #${vendorIdNum} (${vendor.email}) · Restaurant #${restaurantIdNum} (${restaurant.name})`
  );

  const foods = await prisma.food.findMany({
    where: { restaurant_id: restaurantIdNum, status: true },
    orderBy: { id: 'asc' },
    take: 20,
  });
  if (!foods.length) {
    throw new Error('Restaurant has no active foods — add menu items first');
  }

  let customer = await prisma.users.findFirst({
    where: { status: true },
    orderBy: { id: 'asc' },
  });
  if (!customer) {
    const now = new Date();
    customer = await prisma.users.create({
      data: {
        f_name: 'Wallet',
        l_name: 'Tester',
        email: `wallet.tester.${Date.now()}@gizra.test`,
        phone: `+9725${String(Date.now()).slice(-8)}`,
        password: 'unused',
        status: true,
        created_at: now,
        updated_at: now,
      },
    });
    console.log(`Created temp customer #${customer.id}`);
  }

  const before = await ensureWallet(vendorIdNum);
  printWallet('Wallet BEFORE', before);

  const perOrder = roundMoney(TARGET_AMOUNT / ORDER_COUNT);
  const amounts: number[] = [];
  let remaining = TARGET_AMOUNT;
  for (let i = 0; i < ORDER_COUNT; i++) {
    const amount = i === ORDER_COUNT - 1 ? roundMoney(remaining) : perOrder;
    amounts.push(amount);
    remaining = roundMoney(remaining - amount);
  }

  const commissionPct = Number(restaurant.comission ?? 10) || 10;
  const createdOrderIds: number[] = [];

  await prisma.$transaction(async (tx) => {
    const now = new Date();

    for (let i = 0; i < amounts.length; i++) {
      const orderAmount = amounts[i];
      const food = foods[i % foods.length];
      const foodPrice = decimalToNumber(food.price) || orderAmount;
      const qty = Math.max(1, Math.round(orderAmount / foodPrice) || 1);
      const lineTotal = roundMoney(foodPrice * qty);
      // Prefer seeded amount for wallet credit; keep line near menu price for UI realism.
      const restaurantAmount = roundMoney(orderAmount * (1 - commissionPct / 100));
      const adminCommission = roundMoney(orderAmount - restaurantAmount);

      const order = await tx.orders.create({
        data: {
          user_id: Number(customer!.id),
          restaurant_id: restaurantIdNum,
          zone_id: restaurant.zone_id != null ? Number(restaurant.zone_id) : null,
          order_amount: dec(orderAmount),
          coupon_discount_amount: 0,
          payment_status: 'paid',
          order_status: 'delivered',
          total_tax_amount: 0,
          payment_method: 'digital_payment',
          order_type: 'take_away',
          delivery_charge: 0,
          original_delivery_charge: 0,
          restaurant_discount_amount: 0,
          order_note: `Wallet seed for ${EMAIL}`,
          pending: now,
          confirmed: now,
          processing: now,
          handover: now,
          delivered: now,
          created_at: now,
          updated_at: now,
          otp: String(1000 + i),
        },
      });

      await tx.order_details.create({
        data: {
          order_id: Number(order.id),
          food_id: Number(food.id),
          price: dec(foodPrice),
          quantity: BigInt(qty),
          tax_amount: 0,
          discount_on_food: 0,
          discount_type: 'amount',
          total_add_on_price: 0,
          variation: '[]',
          add_ons: '[]',
          food_details: JSON.stringify({
            id: Number(food.id),
            name: food.name,
            price: foodPrice,
            seed_line_total: lineTotal,
          }),
          created_at: now,
          updated_at: now,
        },
      });

      await tx.order_payments.create({
        data: {
          order_id: Number(order.id),
          amount: dec(orderAmount),
          payment_status: 'paid',
          payment_method: 'digital_payment',
          created_at: now,
          updated_at: now,
        },
      });

      await tx.order_transactions.create({
        data: {
          vendor_id: vendorIdNum,
          order_id: Number(order.id),
          order_amount: dec(orderAmount),
          restaurant_amount: dec(restaurantAmount),
          admin_commission: dec(adminCommission),
          received_by: 'admin',
          delivery_charge: 0,
          original_delivery_charge: 0,
          tax: 0,
          zone_id: restaurant.zone_id != null ? Number(restaurant.zone_id) : null,
          status: null,
          created_at: now,
          updated_at: now,
        },
      });

      createdOrderIds.push(Number(order.id));
    }

    const creditTotal = roundMoney(
      amounts.reduce((sum, a) => sum + a * (1 - commissionPct / 100), 0)
    );

    // Also credit the full TARGET_AMOUNT as restaurant earning for easy withdraw testing
    // (commission already deducted above — use restaurant share sum).
    await tx.restaurant_wallets.update({
      where: { id: before.id },
      data: {
        total_earning: { increment: toDecimal(creditTotal) },
        updated_at: now,
      },
    });

    console.log(`\nCreated ${createdOrderIds.length} delivered digital order(s): ${createdOrderIds.join(', ')}`);
    console.log(`Credited restaurant earnings (after ~${commissionPct}% commission): ${creditTotal}`);
  });

  // Top up so withdrawable ≈ TARGET_AMOUNT (after commission the credit is less)
  const mid = await ensureWallet(vendorIdNum);
  const currentBalance = Math.max(
    0,
    computeRestaurantWalletBalance({
      total_earning: decimalToNumber(mid.total_earning),
      total_withdrawn: decimalToNumber(mid.total_withdrawn),
      pending_withdraw: decimalToNumber(mid.pending_withdraw),
      collected_cash: decimalToNumber(mid.collected_cash),
    })
  );
  const topUp = roundMoney(TARGET_AMOUNT - currentBalance);
  if (topUp > 0) {
    await prisma.restaurant_wallets.update({
      where: { id: mid.id },
      data: {
        total_earning: { increment: toDecimal(topUp) },
        updated_at: new Date(),
      },
    });
    console.log(`Top-up to reach ~${TARGET_AMOUNT} withdrawable: +${topUp}`);
  }

  const after = await ensureWallet(vendorIdNum);
  printWallet('Wallet AFTER', after);

  console.log(`\nDone. Log in as ${vendor.email} → My Wallet → Request Withdraw.`);
  console.log('Tip: set a payout method under Wallet Method first if you have not.');
}

main()
  .catch((e) => {
    console.error('\nFAILED:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
