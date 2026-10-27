/**
 * Upsert a platform admin for admin panel / API testing.
 *
 * Usage:
 *   npm run create-admin
 *   npx ts-node scripts/createAdmin.ts
 *   npx ts-node scripts/createAdmin.ts --email=admin@gizra.com --password=12345678
 *
 * Optional env: ADMIN_SEED_EMAIL, ADMIN_SEED_PASSWORD (used when CLI flags omitted)
 */
import dotenv from 'dotenv';
import path from 'path';
import bcrypt from 'bcrypt';
import prisma from '../src/config/database';
import { provisionAccountStorage } from '../src/utils/accountStorage';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const email = arg('email', process.env.ADMIN_SEED_EMAIL || 'admin@gizra.com')
  .trim()
  .toLowerCase();
const plainPassword = arg('password', process.env.ADMIN_SEED_PASSWORD || '12345678');

async function main() {
  const hash = await bcrypt.hash(plainPassword, 10);

  const existing = await prisma.admins.findUnique({ where: { email } });
  let cloudflareId = existing?.cloudflareId ?? null;
  if (!cloudflareId) {
    cloudflareId = await provisionAccountStorage('admin');
  }

  const admin = await prisma.admins.upsert({
    where: { email },
    update: {
      password: hash,
      is_logged_in: true,
      cloudflareId,
      updated_at: new Date(),
    },
    create: {
      email,
      password: hash,
      f_name: 'Gizra',
      l_name: 'Admin',
      role_id: 1,
      cloudflareId,
      is_logged_in: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
  });

  console.log('Admin account ready.');
  console.log('  email:', admin.email);
  console.log('  password:', plainPassword);
  console.log('  id:', admin.id.toString());
  console.log('Login: POST /api/admin/auth/login');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
