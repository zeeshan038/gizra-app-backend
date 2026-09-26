/**
 * Upsert a platform admin for Postman / admin API testing.
 * Usage: npx ts-node scripts/createAdmin.ts
 * Optional: ADMIN_SEED_EMAIL, ADMIN_SEED_PASSWORD in .env
 */
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import prisma from '../src/config/database';

dotenv.config();

async function main() {
  const email = process.env.ADMIN_SEED_EMAIL || 'admin@gizra.com';
  const plainPassword = process.env.ADMIN_SEED_PASSWORD || 'AdminPassword123!';
  const hash = await bcrypt.hash(plainPassword, 10);

  const admin = await prisma.admins.upsert({
    where: { email },
    update: {
      password: hash,
      is_logged_in: true,
      updated_at: new Date(),
    },
    create: {
      email,
      password: hash,
      f_name: 'Gizra',
      l_name: 'Admin',
      role_id: 1,
      is_logged_in: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
  });

  console.log('Admin account ready.');
  console.log('  email:', admin.email);
  console.log('  id:', admin.id.toString());
  console.log('Login: POST /api/admin/auth/login');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
