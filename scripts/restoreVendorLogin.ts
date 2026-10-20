/**
 * Restore / create vendor login when an email is missing from DB.
 *
 * Default: restaurant9339@gizra.com → attaches to the restaurant that has
 * the Smoothie/Fresh Juice menu (Mudassir / vendor #4) and resets password.
 *
 * Usage:
 *   npx ts-node scripts/restoreVendorLogin.ts
 *   npx ts-node scripts/restoreVendorLogin.ts --email=restaurant9339@gizra.com --password=12345678
 */
import dotenv from 'dotenv';
import path from 'path';
import bcrypt from 'bcrypt';
import prisma from '../src/config/database';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const EMAIL = arg('email', 'restaurant9339@gizra.com').trim().toLowerCase();
const PASSWORD = arg('password', '12345678');

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const now = new Date();

  let vendor = await prisma.vendors.findFirst({
    where: { email: { equals: EMAIL, mode: 'insensitive' } },
  });

  if (vendor) {
    await prisma.vendors.update({
      where: { id: vendor.id },
      data: { password: hash, updated_at: now },
    });
    console.log(`Updated password for existing vendor #${vendor.id} (${vendor.email})`);
  } else {
    // Prefer the restaurant that owns the demo menu the user was viewing
    const smoothie = await prisma.food.findFirst({
      where: { name: { equals: 'Smoothie', mode: 'insensitive' }, status: true },
      orderBy: { id: 'desc' },
    });

    let restaurant = smoothie
      ? await prisma.restaurants.findFirst({
          where: { id: BigInt(Number(smoothie.restaurant_id)) },
        })
      : null;

    if (restaurant) {
      const oldVendor = await prisma.vendors.findFirst({
        where: { id: BigInt(Number(restaurant.vendor_id)) },
      });
      if (!oldVendor) throw new Error('Restaurant has no vendor row');

      const oldEmail = oldVendor.email;
      vendor = await prisma.vendors.update({
        where: { id: oldVendor.id },
        data: {
          email: EMAIL,
          password: hash,
          updated_at: now,
        },
      });
      await prisma.restaurants.update({
        where: { id: restaurant.id },
        data: { email: EMAIL, updated_at: now },
      });
      console.log(`Restored login on restaurant #${restaurant.id} (${restaurant.name})`);
      console.log(`  previous vendor email: ${oldEmail}`);
      console.log(`  new vendor email:      ${EMAIL}`);
    } else {
      // Create a fresh vendor + restaurant shell
      vendor = await prisma.vendors.create({
        data: {
          f_name: 'Restaurant',
          l_name: '9339',
          email: EMAIL,
          phone: `+9725${String(Date.now()).slice(-8)}`,
          password: hash,
          created_at: now,
          updated_at: now,
        },
      });
      restaurant = await prisma.restaurants.create({
        data: {
          name: 'Restaurant 9339',
          phone: vendor.phone,
          email: EMAIL,
          vendor_id: Number(vendor.id),
          address: 'Israel',
          tax: 0,
          status: true,
          active: true,
          created_at: now,
          updated_at: now,
        },
      });
      await prisma.restaurant_wallets.create({
        data: {
          vendor_id: Number(vendor.id),
          total_earning: 0,
          total_withdrawn: 0,
          pending_withdraw: 0,
          collected_cash: 0,
          created_at: now,
          updated_at: now,
        },
      });
      console.log(`Created new vendor #${vendor.id} + restaurant #${restaurant.id}`);
    }
  }

  console.log('\nYou can sign in now:');
  console.log(`  email:    ${EMAIL}`);
  console.log(`  password: ${PASSWORD}`);
  console.log('  POST http://localhost:3000/api/vendor/login');
}

main()
  .catch((e) => {
    console.error('FAILED:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
