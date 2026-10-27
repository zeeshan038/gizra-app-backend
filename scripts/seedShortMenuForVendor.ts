/**
 * Add a short demo menu to a vendor restaurant by email.
 * Usage: npx ts-node scripts/seedShortMenuForVendor.ts zeeshandev038@gmail.com
 */
import dotenv from 'dotenv';
import path from 'path';
import prisma from '../src/config/database';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const email = (process.argv[2] || 'zeeshandev038@gmail.com').trim().toLowerCase();

type MenuItem = { name: string; price: number; description: string; recommended?: boolean };

const SHORT_MENU: { category: string; items: MenuItem[] }[] = [
  {
    category: 'Main Course',
    items: [
      { name: 'Grilled Chicken', price: 45, description: 'Chicken breast with herbs', recommended: true },
      { name: 'Beef Burger', price: 38, description: 'Classic beef burger with fries' },
    ],
  },
  {
    category: 'Appetizers',
    items: [
      { name: 'Hummus Plate', price: 18, description: 'Creamy hummus with pita', recommended: true },
      { name: 'French Fries', price: 15, description: 'Crispy golden fries' },
    ],
  },
  {
    category: 'Drinks',
    items: [
      { name: 'Fresh Lemonade', price: 12, description: 'House lemonade' },
      { name: 'Cola', price: 10, description: 'Chilled soft drink' },
    ],
  },
];

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

async function main() {
  const vendor = await prisma.vendors.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
  });
  if (!vendor) {
    throw new Error(`Vendor not found for email: ${email}`);
  }

  const restaurant = await prisma.restaurants.findFirst({
    where: { vendor_id: Number(vendor.id) },
    orderBy: { id: 'asc' },
  });
  if (!restaurant) {
    throw new Error(`No restaurant for vendor ${email} (id=${vendor.id})`);
  }

  const restaurantId = Number(restaurant.id);
  console.log(
    `Vendor ${vendor.id} ${vendor.email} → restaurant ${restaurantId} "${restaurant.name}"`
  );

  const existingFoods = await prisma.food.count({
    where: { restaurant_id: restaurantId, is_draft: 0 },
  });
  if (existingFoods > 0) {
    console.log(`Restaurant already has ${existingFoods} food(s). Adding short menu anyway (skip duplicates by name).`);
  }

  const now = new Date();
  let createdCats = 0;
  let createdFoods = 0;

  for (let i = 0; i < SHORT_MENU.length; i++) {
    const block = SHORT_MENU[i];
    let category = await prisma.categories.findFirst({
      where: {
        restaurant_id: restaurantId,
        name: { equals: block.category, mode: 'insensitive' },
      },
    });

    if (!category) {
      category = await prisma.categories.create({
        data: {
          restaurant_id: restaurantId,
          name: block.category,
          image: 'def.png',
          parent_id: BigInt(0),
          position: BigInt(0),
          status: true,
          priority: BigInt(SHORT_MENU.length - i),
          slug: slugify(block.category),
          created_at: now,
          updated_at: now,
        },
      });
      createdCats += 1;
      console.log(`  + category ${category.id} ${category.name}`);
    } else {
      console.log(`  = category ${category.id} ${category.name}`);
    }

    const categoryId = Number(category.id);
    const categoryIds = JSON.stringify([
      { id: String(categoryId), position: 1, name: category.name },
    ]);

    for (const item of block.items) {
      const existing = await prisma.food.findFirst({
        where: {
          restaurant_id: restaurantId,
          name: { equals: item.name, mode: 'insensitive' },
        },
      });
      if (existing) {
        console.log(`    = food ${existing.id} ${existing.name}`);
        continue;
      }

      const food = await prisma.food.create({
        data: {
          name: item.name,
          description: item.description,
          image: 'def.png',
          category_id: categoryId,
          category_ids: categoryIds,
          variations: '[]',
          add_ons: '[]',
          attributes: '[]',
          choice_options: '[]',
          price: item.price,
          tax: 0,
          tax_type: 'percent',
          discount: 0,
          discount_type: 'percent',
          available_time_starts: new Date('1970-01-01T00:00:00.000Z'),
          available_time_ends: new Date('1970-01-01T23:59:00.000Z'),
          veg: false,
          status: true,
          restaurant_id: restaurantId,
          order_count: BigInt(0),
          avg_rating: 0,
          rating_count: BigInt(0),
          recommended: Boolean(item.recommended),
          slug: slugify(item.name),
          is_halal: false,
          item_stock: BigInt(0),
          sell_count: BigInt(0),
          stock_type: 'unlimited',
          is_draft: 0,
          created_at: now,
          updated_at: now,
        },
      });
      createdFoods += 1;
      console.log(`    + food ${food.id} ${food.name} ₪${item.price}`);
    }
  }

  const totalFoods = await prisma.food.count({
    where: { restaurant_id: restaurantId, is_draft: 0, status: true },
  });
  console.log(`Done. created_categories=${createdCats} created_foods=${createdFoods} active_foods_total=${totalFoods}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
