/**
 * Approve all pending delivery men (riders) for local / Postman testing.
 * Same idea as scripts/approve.js for vendors.
 *
 * Usage: npm run approve-riders
 * Optional: APPROVE_ALL_RIDERS=1 to also activate already-approved rows with status=false
 */
import dotenv from 'dotenv';
import prisma from '../src/config/database';

dotenv.config();

async function main() {
  const pending = await prisma.delivery_men.updateMany({
    where: { application_status: 'pending' },
    data: {
      application_status: 'approved',
      status: true,
      updated_at: new Date(),
    },
  });

  let reactivated = { count: 0 };
  if (process.env.APPROVE_ALL_RIDERS === '1') {
    reactivated = await prisma.delivery_men.updateMany({
      where: {
        application_status: 'approved',
        status: false,
      },
      data: {
        status: true,
        updated_at: new Date(),
      },
    });
  }

  const total = await prisma.delivery_men.count({
    where: { application_status: 'approved', status: true },
  });

  console.log('Delivery men (riders) approval complete.');
  console.log(`  pending → approved: ${pending.count}`);
  if (reactivated.count > 0) {
    console.log(`  reactivated (status=true): ${reactivated.count}`);
  }
  console.log(`  total approved & active (status=true): ${total}`);
  console.log('Riders can now POST /api/delivery-man/login');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
