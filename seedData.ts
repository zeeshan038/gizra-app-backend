import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting data seeding...');

  try {
    // 1. Create Zone using Raw SQL because Prisma doesn't support 'polygon' natively
    console.log('Creating Zone...');
    await prisma.$executeRawUnsafe(`
      INSERT INTO zones (name, coordinates, status, created_at, updated_at)
      VALUES (
        'Main City Zone', 
        '((0,0),(0,10),(10,10),(10,0),(0,0))',
        true, NOW(), NOW()
      ) ON CONFLICT (name) DO NOTHING;
    `);

    // Fetch the zone id
    const zone: any[] = await prisma.$queryRawUnsafe(`SELECT id FROM zones WHERE name = 'Main City Zone' LIMIT 1;`);
    const zoneId = zone.length > 0 ? zone[0].id : 1;

    // 2. Create a Vendor
    console.log('Creating Vendor...');
    const vendor = await prisma.vendors.upsert({
      where: { email: 'vendor@gizra.com' },
      update: {},
      create: {
        f_name: 'John',
        l_name: 'Doe',
        phone: '1234567890',
        email: 'vendor@gizra.com',
        password: '$2b$10$wE/.z5z264M9.5z.q.h3y.5hGv.z44N/JvF9K1fO1Z598kX/T00a2', // hashed 'password'
        status: true,
      },
    });

    // 3. Create a Restaurant
    console.log('Creating Restaurant...');
    const restaurant = await prisma.restaurants.upsert({
      where: { phone: '0987654321' },
      update: {},
      create: {
        name: 'Gizra Awesome Restaurant',
        phone: '0987654321',
        email: 'restaurant@gizra.com',
        address: '123 Main Street',
        minimum_order: 10.0,
        comission: 5.0,
        vendor_id: Number(vendor.id),
        zone_id: Number(zoneId),
        status: true,
        free_delivery: true,
        delivery: true,
        take_away: true,
        veg: true,
        non_veg: true,
      },
    });

    // 4. Create Category
    console.log('Creating Category...');
    const category = await prisma.categories.create({
      data: {
        name: 'Burgers',
        parent_id: 0,
        position: 1,
        status: true,
        restaurant_id: Number(restaurant.id),
      },
    });

    // 5. Create Food Items
    console.log('Creating Food items...');
    await prisma.food.createMany({
      data: [
        {
          name: 'Classic Cheeseburger',
          description: 'A delicious classic cheeseburger with fresh ingredients.',
          price: 15.0,
          restaurant_id: Number(restaurant.id),
          category_id: Number(category.id),
          category_ids: `[{"id":"${category.id}","position":1}]`,
          veg: false,
          status: true,
        },
        {
          name: 'Veggie Burger',
          description: 'Healthy and tasty veggie burger.',
          price: 12.0,
          restaurant_id: Number(restaurant.id),
          category_id: Number(category.id),
          category_ids: `[{"id":"${category.id}","position":1}]`,
          veg: true,
          status: true,
        },
      ],
    });

    // 6. Create Slider Banners
    console.log('Creating Slider Banners...');
    await prisma.banners.create({
      data: {
        title: 'Welcome to Gizra!',
        type: 'restaurant_wise',
        image: 'banner1.png',
        data: restaurant.id.toString(),
        zone_id: Number(zoneId),
        status: true,
      }
    });

    console.log('✅ Seeding completed successfully!');
  } catch (error) {
    console.error('❌ Error during seeding:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
