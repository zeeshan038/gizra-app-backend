const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function approveAll() {
  try {
    await prisma.vendors.updateMany({ data: { status: true } });
    await prisma.restaurants.updateMany({ data: { status: true } });
    console.log('✅ Success: All vendors and restaurants have been approved and activated!');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

approveAll();
