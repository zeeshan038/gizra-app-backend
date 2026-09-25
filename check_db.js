const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const vendors = await prisma.vendors.findMany();
  const restaurants = await prisma.restaurants.findMany();
  console.log('Vendors:', vendors.map(v => ({ email: v.email, status: v.status })));
  console.log('Restaurants:', restaurants.map(r => ({ name: r.name, vendor_id: r.vendor_id, status: r.status })));
}
main().finally(() => prisma.$disconnect());
