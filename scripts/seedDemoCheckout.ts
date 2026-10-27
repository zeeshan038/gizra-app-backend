/**
 * Seed one consumer, vendor, driver, and a restaurant with menu items for checkout / payment testing.
 *
 * Usage: npm run seed:demo-checkout
 *
 * Default password for all accounts: password
 */
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import bcrypt from 'bcrypt';
import prisma from '../src/config/database';
import { insertZone } from '../src/utils/zone/db';
import { LngLatPair } from '../src/utils/zone/geometry';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DEMO_PASSWORD = 'password';
const DEMO_ZONE_NAME = 'Gizra Demo Zone';

const DEMO_ZONE_RING: LngLatPair[] = [
  [35.05, 31.48],
  [35.05, 31.58],
  [35.18, 31.58],
  [35.18, 31.48],
  [35.05, 31.48],
];

const REST_LAT = 31.531;
const REST_LNG = 35.115;

const ACCOUNTS = {
  consumer: {
    email: 'consumer@gizra.test',
    phone: '+972501000001',
    f_name: 'Test',
    l_name: 'Customer',
  },
  vendor: {
    email: 'vendor@gizra.test',
    phone: '+972501000002',
    f_name: 'Test',
    l_name: 'Vendor',
  },
  driver: {
    email: 'driver@gizra.test',
    phone: '+972501000003',
    f_name: 'Test',
    l_name: 'Driver',
  },
  restaurant: {
    name: 'Gizra Test Kitchen',
    phone: '+972501000010',
    email: 'kitchen@gizra.test',
    address: 'Demo Street 1, Hebron area',
  },
} as const;

async function ensurePostgis(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS postgis;');
  } catch (e) {
    console.warn('PostGIS extension skipped:', (e as Error).message);
  }
}

async function ensureDemoZone(): Promise<number> {
  let row = await prisma.zones.findFirst({ where: { name: DEMO_ZONE_NAME } });
  if (row) return Number(row.id);

  const any = await prisma.zones.findFirst({ orderBy: { id: 'asc' } });
  if (any) {
    console.log(`Using existing zone ${any.id} (${any.name}).`);
    return Number(any.id);
  }

  await ensurePostgis();
  const id = await insertZone({
    name: DEMO_ZONE_NAME,
    display_name: 'Demo checkout zone',
    status: true,
    coordinates: DEMO_ZONE_RING,
    per_km_shipping_charge: 0.5,
    minimum_shipping_charge: 2,
    maximum_shipping_charge: 15,
    max_cod_order_amount: 500,
    increased_delivery_fee: 0,
    increased_delivery_fee_status: false,
    increase_delivery_charge_message: null,
  });
  console.log(`Created zone ${id} (${DEMO_ZONE_NAME}).`);
  return id;
}

function demoRefCode(prefix: string, id: number): string {
  return `${prefix}${id}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

async function ensureConsumer(zoneId: number, passwordHash: string) {
  const { consumer } = ACCOUNTS;
  let user = await prisma.users.findFirst({
    where: { OR: [{ email: consumer.email }, { phone: consumer.phone }] },
  });
  if (!user) {
    user = await prisma.users.create({
      data: {
        f_name: consumer.f_name,
        l_name: consumer.l_name,
        phone: consumer.phone,
        email: consumer.email,
        password: passwordHash,
        status: true,
        is_phone_verified: true,
        zone_id: zoneId,
        ref_code: 'TMP',
      },
    });
    user = await prisma.users.update({
      where: { id: user.id },
      data: { ref_code: demoRefCode('CUS', Number(user.id)) },
    });
    console.log('Created consumer', consumer.email);
  } else {
    user = await prisma.users.update({
      where: { id: user.id },
      data: {
        password: passwordHash,
        status: true,
        is_phone_verified: true,
        zone_id: zoneId,
      },
    });
    console.log('Updated consumer', consumer.email);
  }

  const userId = Number(user.id);
  const addr = await prisma.customer_addresses.findFirst({
    where: { user_id: userId, address_type: 'home' },
  });
  if (!addr) {
    await prisma.customer_addresses.create({
      data: {
        address_type: 'home',
        contact_person_number: consumer.phone,
        contact_person_name: `${consumer.f_name} ${consumer.l_name}`,
        address: 'Demo delivery address',
        latitude: String(REST_LAT + 0.002),
        longitude: String(REST_LNG + 0.002),
        user_id: userId,
        zone_id: zoneId,
      },
    });
    console.log('Created consumer delivery address.');
  }

  return user;
}

async function ensureVendor(passwordHash: string) {
  const { vendor } = ACCOUNTS;
  return prisma.vendors.upsert({
    where: { email: vendor.email },
    update: { password: passwordHash, status: true },
    create: {
      f_name: vendor.f_name,
      l_name: vendor.l_name,
      phone: vendor.phone,
      email: vendor.email,
      password: passwordHash,
      status: true,
    },
  });
}

async function ensureRestaurant(vendorId: number, zoneId: number) {
  const { restaurant } = ACCOUNTS;
  return prisma.restaurants.upsert({
    where: { phone: restaurant.phone },
    update: {
      name: restaurant.name,
      vendor_id: vendorId,
      zone_id: zoneId,
      status: true,
      active: true,
      delivery: true,
      take_away: true,
      schedule_order: true,
      latitude: String(REST_LAT),
      longitude: String(REST_LNG),
      minimum_order: 10,
      free_delivery: false,
      veg: true,
      non_veg: true,
    },
    create: {
      name: restaurant.name,
      phone: restaurant.phone,
      email: restaurant.email,
      address: restaurant.address,
      minimum_order: 10,
      comission: 10,
      vendor_id: vendorId,
      zone_id: zoneId,
      status: true,
      active: true,
      delivery: true,
      take_away: true,
      schedule_order: true,
      latitude: String(REST_LAT),
      longitude: String(REST_LNG),
      free_delivery: false,
      veg: true,
      non_veg: true,
      restaurant_model: 'commission',
    },
  });
}

async function ensureRestaurantSchedule(restaurantId: number) {
  const existing = await prisma.restaurant_schedule.count({
    where: { restaurant_id: restaurantId },
  });
  if (existing >= 7) return;

  const now = new Date();
  for (let day = 0; day < 7; day += 1) {
    const row = await prisma.restaurant_schedule.findFirst({
      where: { restaurant_id: restaurantId, day: BigInt(day) },
    });
    if (row) continue;
    await prisma.restaurant_schedule.create({
      data: {
        restaurant_id: restaurantId,
        day: BigInt(day),
        opening_time: new Date('1970-01-01T00:00:00.000Z'),
        closing_time: new Date('1970-01-01T23:59:59.000Z'),
        created_at: now,
        updated_at: now,
      },
    });
  }
  console.log('Ensured restaurant open hours (7 days).');
}

async function ensureMenu(restaurantId: number) {
  let category = await prisma.categories.findFirst({
    where: { restaurant_id: restaurantId, name: 'Main dishes' },
  });
  if (!category) {
    category = await prisma.categories.create({
      data: {
        name: 'Main dishes',
        parent_id: 0,
        position: 1,
        status: true,
        restaurant_id: restaurantId,
      },
    });
    console.log('Created category Main dishes.');
  }

  const categoryId = Number(category.id);
  const items = [
    {
      name: 'Demo Burger',
      description: 'Seed item for payment testing.',
      price: 45,
      veg: false,
    },
    {
      name: 'Demo Salad',
      description: 'Light option for checkout tests.',
      price: 32,
      veg: true,
    },
  ];

  for (const item of items) {
    const exists = await prisma.food.findFirst({
      where: { restaurant_id: restaurantId, name: item.name },
    });
    if (exists) continue;
    await prisma.food.create({
      data: {
        name: item.name,
        description: item.description,
        price: item.price,
        restaurant_id: restaurantId,
        category_id: categoryId,
        category_ids: JSON.stringify([{ id: String(categoryId), position: 1 }]),
        veg: item.veg,
        status: true,
        stock_type: 'unlimited',
      },
    });
  }
  console.log('Ensured menu items on restaurant', restaurantId);
}

async function ensureDriver(zoneId: number, passwordHash: string) {
  const { driver } = ACCOUNTS;
  return prisma.delivery_men.upsert({
    where: { phone: driver.phone },
    update: {
      password: passwordHash,
      status: true,
      active: true,
      application_status: 'approved',
      zone_id: zoneId,
      email: driver.email,
    },
    create: {
      f_name: driver.f_name,
      l_name: driver.l_name,
      phone: driver.phone,
      email: driver.email,
      password: passwordHash,
      zone_id: zoneId,
      status: true,
      active: true,
      application_status: 'approved',
      type: 'zone_wise',
      earning: true,
    },
  });
}

async function main() {
  console.log('Seeding demo checkout data…\n');
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const zoneId = await ensureDemoZone();

  await ensureConsumer(zoneId, passwordHash);
  const vendor = await ensureVendor(passwordHash);
  const restaurant = await ensureRestaurant(Number(vendor.id), zoneId);
  const restaurantId = Number(restaurant.id);

  await ensureRestaurantSchedule(restaurantId);
  await ensureMenu(restaurantId);
  await ensureDriver(zoneId, passwordHash);

  console.log('\n--- Demo accounts (password: password) ---');
  console.log('Consumer:', ACCOUNTS.consumer.phone, ACCOUNTS.consumer.email);
  console.log('Vendor:  ', ACCOUNTS.vendor.phone, ACCOUNTS.vendor.email);
  console.log('Driver:  ', ACCOUNTS.driver.phone, ACCOUNTS.driver.email);
  console.log('Restaurant:', restaurant.name, `(id ${restaurantId}, zone ${zoneId})`);
  console.log('\nRun npm run seed:business-settings if checkout flags are missing.');
  console.log('Restart API after seeding business_settings if it is already running.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
