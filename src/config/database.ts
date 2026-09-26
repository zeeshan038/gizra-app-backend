import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

//Test Connection
export const connectDB = async () => {
  try {
    await prisma.$connect();
    try {
      await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS postgis;');
    } catch (postgisErr) {
      console.warn(
        'PostGIS extension could not be enabled (zone APIs need postgis/postgis image or CREATE EXTENSION postgis):',
        postgisErr
      );
    }
    console.log('Connected to PostgreSQL Database via Prisma');
  } catch (err) {
    console.error('Failed to connect to PostgreSQL Database:', err);
  }
};

export default prisma;
