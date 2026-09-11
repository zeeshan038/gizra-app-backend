import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const testConnection = async () => {
  try {
    await prisma.$connect();
    console.log('Connected to PostgreSQL Database via Prisma');
  } catch (err) {
    console.error('Failed to connect to PostgreSQL Database:', err);
  }
};

export default prisma;
