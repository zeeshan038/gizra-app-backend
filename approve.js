require('dotenv').config();
const { buildDatabaseUrl } = require('./scripts/build-database-url');

const useProd =
  process.argv.includes('--prod') ||
  process.env.APPROVE_TARGET === 'prod';

if (useProd) {
  const prodUrl = process.env.DATABASE_URL_PROD?.trim();
  if (!prodUrl) {
    console.error('❌ Set DATABASE_URL_PROD in .env (see .env.example).');
    process.exit(1);
  }
  process.env.DATABASE_URL = prodUrl;
  console.log('Using production database (DATABASE_URL_PROD).');
} else if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = buildDatabaseUrl();
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function approveAll() {
  try {
    const vendors = await prisma.vendors.updateMany({ data: { status: true } });
    const restaurants = await prisma.restaurants.updateMany({ data: { status: true } });
    const riders = await prisma.delivery_men.updateMany({
      where: { application_status: 'pending' },
      data: {
        application_status: 'approved',
        status: true,
        updated_at: new Date(),
      },
    });
    console.log('✅ Success: Vendors, restaurants, and pending riders updated.');
    console.log(`   vendors: ${vendors.count}, restaurants: ${restaurants.count}, riders approved: ${riders.count}`);
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

approveAll();
