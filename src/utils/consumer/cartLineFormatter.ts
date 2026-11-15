import type { carts } from '@prisma/client';
import prisma from '../../config/database';
import { publicFoodMediaUrl } from '../mediaStorage';
import { attachSellingTimeToCartRows } from './cartFoodSellingTime';
import { batchCartLineAddonUnitTotals } from './cartAddonTotals';

export type ParsedCartRow = {
  id: string;
  user_id: string | null;
  is_guest: boolean;
  item_id: string | null;
  item_type: string;
  quantity: number;
  price: number;
  add_on_ids: number[];
  add_on_qtys: number[];
  add_on_placements: unknown[];
  variations: unknown[];
  variation_options: unknown[];
};

export function parsePrismaCartRow(cart: carts): ParsedCartRow {
  return {
    id: cart.id.toString(),
    user_id: cart.user_id != null ? String(cart.user_id) : null,
    is_guest: Boolean(cart.is_guest),
    item_id: cart.item_id != null ? String(cart.item_id) : null,
    item_type: cart.item_type ?? 'Food',
    quantity: Number(cart.quantity) || 0,
    price: Number(cart.price),
    add_on_ids: cart.add_on_ids ? JSON.parse(cart.add_on_ids) : [],
    add_on_qtys: cart.add_on_qtys ? JSON.parse(cart.add_on_qtys) : [],
    add_on_placements: cart.add_on_placements ? JSON.parse(cart.add_on_placements) : [],
    variations: cart.variations ? JSON.parse(cart.variations) : [],
    variation_options: cart.variation_options ? JSON.parse(cart.variation_options) : [],
  };
}

export async function formatConsumerCartLines(rows: ParsedCartRow[]) {
  if (!rows.length) return [];

  const foodIds = [
    ...new Set(
      rows
        .filter((r) => String(r.item_type).toLowerCase() === 'food')
        .map((r) => Number(r.item_id))
        .filter((id) => Number.isFinite(id) && id > 0)
    ),
  ];

  const foodById = new Map<
    number,
    { name: string | null; image: string | null; restaurant_id: number }
  >();
  const restaurantNameById = new Map<number, string | null>();

  if (foodIds.length) {
    const foods = await prisma.food.findMany({
      where: { id: { in: foodIds.map((id) => BigInt(id)) } },
      select: { id: true, name: true, image: true, restaurant_id: true },
    });
    const restaurantIds = [...new Set(foods.map((f) => Number(f.restaurant_id)))];
    const restaurants = restaurantIds.length
      ? await prisma.restaurants.findMany({
          where: { id: { in: restaurantIds } },
          select: { id: true, name: true },
        })
      : [];
    for (const r of restaurants) {
      restaurantNameById.set(Number(r.id), r.name);
    }
    for (const f of foods) {
      const rid = Number(f.restaurant_id);
      foodById.set(Number(f.id), {
        name: f.name,
        image: f.image,
        restaurant_id: rid,
      });
    }
  }

  const addonTotals = await batchCartLineAddonUnitTotals(rows);

  const base = rows.map((row, index) => {
    const itemId = Number(row.item_id);
    const food = foodById.get(itemId);
    const unitAddons = addonTotals[index] ?? 0;
    const unitPrice = Number(row.price);
    const unitBase = Math.round((unitPrice - unitAddons) * 100) / 100;
    const restaurantId = food?.restaurant_id;
    return {
      ...row,
      restaurant_id: restaurantId != null ? String(restaurantId) : null,
      restaurant_name: restaurantId != null ? restaurantNameById.get(restaurantId) ?? null : null,
      title: food?.name ?? null,
      image_url: food?.image ? publicFoodMediaUrl(food.image) : null,
      unit_base_price: unitBase,
      unit_addons_total: unitAddons,
    };
  });

  return attachSellingTimeToCartRows(base);
}

export async function formatConsumerCartLine(row: ParsedCartRow) {
  const lines = await formatConsumerCartLines([row]);
  return lines[0] ?? row;
}