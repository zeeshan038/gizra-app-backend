import prisma from '../../../config/database';

export type FoodAddonInput = { id?: number; name: string; price: number };

export type FoodAddonExpanded = {
  id: number;
  name: string;
  price: number;
  status: boolean;
};

export function parseStoredFoodAddonIds(raw: string | null | unknown): number[] {
  if (raw == null || raw === '') return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    if (parsed.length === 0) return [];
    if (typeof parsed[0] === 'number') {
      return parsed.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0);
    }
    if (typeof parsed[0] === 'string' && /^\d+$/.test(parsed[0])) {
      return parsed.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0);
    }
    return [];
  } catch {
    return [];
  }
}

export function normalizeAddOnPayload(raw: unknown): FoodAddonInput[] {
  if (!Array.isArray(raw)) return [];
  const out: FoodAddonInput[] = [];
  for (const item of raw) {
    if (typeof item === 'number' && Number.isFinite(item)) {
      out.push({ id: item, name: '', price: 0 });
      continue;
    }
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      const name = o.name != null ? String(o.name).trim() : '';
      const price = Number(o.price ?? 0);
      const id = o.id != null ? Number(o.id) : undefined;
      if (name || (id && Number.isFinite(id))) {
        out.push({
          id: id && Number.isFinite(id) ? id : undefined,
          name,
          price: Number.isFinite(price) ? price : 0,
        });
      }
    }
  }
  return out;
}

/** Persist add-on rows and return food.add_ons JSON as numeric id list. */
export async function syncFoodAddons(
  restaurantId: number,
  items: FoodAddonInput[]
): Promise<number[]> {
  const ids: number[] = [];

  for (const item of items) {
    const name = item.name?.trim();
    if (!name) continue;
    const price = Number.isFinite(Number(item.price)) ? Number(item.price) : 0;

    if (item.id) {
      const existing = await prisma.add_ons.findFirst({
        where: { id: BigInt(item.id), restaurant_id: restaurantId },
      });
      if (existing) {
        await prisma.add_ons.update({
          where: { id: existing.id },
          data: { name, price, status: true },
        });
        ids.push(Number(existing.id));
        continue;
      }
    }

    const byName = await prisma.add_ons.findFirst({
      where: {
        restaurant_id: restaurantId,
        name: { equals: name, mode: 'insensitive' },
      },
    });

    if (byName) {
      await prisma.add_ons.update({
        where: { id: byName.id },
        data: { price, status: true },
      });
      ids.push(Number(byName.id));
    } else {
      const created = await prisma.add_ons.create({
        data: {
          name,
          price,
          restaurant_id: restaurantId,
          stock_type: 'unlimited',
          addon_stock: 0,
          status: true,
        },
      });
      ids.push(Number(created.id));
    }
  }

  return ids;
}

export async function resolveAddOnIdsForSave(
  restaurantId: number,
  raw: unknown
): Promise<number[]> {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  if (typeof raw[0] === 'number') {
    return raw.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0);
  }
  const items = normalizeAddOnPayload(raw).filter((i) => i.name.trim());
  return syncFoodAddons(restaurantId, items);
}

export async function loadAddonLookup(
  addonIds: number[]
): Promise<Map<number, FoodAddonExpanded>> {
  const unique = [...new Set(addonIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (!unique.length) return new Map();

  const rows = await prisma.add_ons.findMany({
    where: { id: { in: unique.map((id) => BigInt(id)) }, status: true },
  });

  return new Map(
    rows.map((r) => [
      Number(r.id),
      {
        id: Number(r.id),
        name: r.name ?? '',
        price: Number(r.price),
        status: r.status,
      },
    ])
  );
}

export async function buildAddonLookupFromFoodRows(
  rows: { add_ons: string | null }[]
): Promise<Map<number, FoodAddonExpanded>> {
  const ids = new Set<number>();
  for (const row of rows) {
    parseStoredFoodAddonIds(row.add_ons).forEach((id) => ids.add(id));
  }
  return loadAddonLookup([...ids]);
}

export function expandAddOnsFromStored(
  stored: string | null | unknown,
  lookup: Map<number, FoodAddonExpanded>
): FoodAddonExpanded[] {
  if (stored == null || stored === '') return [];
  try {
    const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
    if (!Array.isArray(parsed)) return [];
    if (parsed.length === 0) return [];
    if (typeof parsed[0] === 'object' && parsed[0] !== null && 'name' in (parsed[0] as object)) {
      return parsed.map((row) => {
        const o = row as Record<string, unknown>;
        return {
          id: Number(o.id),
          name: String(o.name ?? ''),
          price: Number(o.price ?? 0),
          status: o.status !== false,
        };
      });
    }
    return parseStoredFoodAddonIds(stored)
      .map((id) => lookup.get(id))
      .filter((row): row is FoodAddonExpanded => Boolean(row));
  } catch {
    return [];
  }
}
