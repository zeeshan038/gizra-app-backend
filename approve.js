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
