import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    const email = 'admin@gizra.com';
    const password = 'AdminPassword123!';
    
    console.log('Checking for existing admin...');
    const existingAdmin = await prisma.admins.findUnique({
        where: { email }
    });

    if (existingAdmin) {
        console.log('Admin already exists! You can log in with:');
        console.log(`Email: ${email}`);
        return;
    }

    console.log('Hashing password...');
    const hashedPassword = await bcrypt.hash(password, 10);

    console.log('Creating admin in database...');
    const admin = await prisma.admins.create({
        data: {
            f_name: 'Super',
            l_name: 'Admin',
            email,
            password: hashedPassword,
            role_id: 1, 
            is_logged_in: false,
            created_at: new Date(),
            updated_at: new Date()
        }
    });

    console.log('====================================');
    console.log('Successfully created admin account!');
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
    console.log('====================================');
}

main()
  .catch(e => {
      console.error(e);
      process.exit(1);
  })
  .finally(async () => {
      await prisma.$disconnect();
  });
