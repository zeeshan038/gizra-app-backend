/** Discount, stock, veg, availability times — vendor food detail fields. */

export function parseVendorFoodTimeInput(raw: unknown): Date | null {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;

  const s = String(raw).trim();
  const timePart = s.includes('T') ? s.split('T')[1]?.replace(/Z$/i, '') ?? s : s;
  const match = timePart.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    const hh = match[1].padStart(2, '0');
    const mm = match[2];
    const ss = match[3] ?? '00';
    return new Date(`1970-01-01T${hh}:${mm}:${ss}.000Z`);
  }

  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatVendorFoodTimeForApi(value: unknown): string | null {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export type VendorFoodDetailPayload = {
  discount?: number;
  discount_type?: string;
  stock_type?: string;
  item_stock?: number;
  available_time_starts?: unknown;
  available_time_ends?: unknown;
  veg?: boolean;
  status?: boolean;
};

export function normalizeStockType(raw: unknown): 'limited' | 'unlimited' {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  return s === 'limited' ? 'limited' : 'unlimited';
}

export function applyVendorFoodDetailFields(
  target: Record<string, unknown>,
  payload: VendorFoodDetailPayload
): void {
  if (payload.discount !== undefined) {
    target.discount = Number(payload.discount) || 0;
  }
  if (payload.discount_type !== undefined) {
    target.discount_type = payload.discount_type === 'amount' ? 'amount' : 'percent';
  }
  if (payload.stock_type !== undefined) {
    const stockType = normalizeStockType(payload.stock_type);
    target.stock_type = stockType;
    if (stockType === 'unlimited') {
      target.item_stock = BigInt(0);
    } else {
      target.item_stock = BigInt(
        Math.max(0, Math.floor(Number(payload.item_stock ?? target.item_stock ?? 0) || 0))
      );
    }
  } else if (payload.item_stock !== undefined) {
    target.item_stock = BigInt(Math.max(0, Math.floor(Number(payload.item_stock) || 0)));
  }
  if (payload.available_time_starts !== undefined) {
    target.available_time_starts = parseVendorFoodTimeInput(payload.available_time_starts);
  }
  if (payload.available_time_ends !== undefined) {
    target.available_time_ends = parseVendorFoodTimeInput(payload.available_time_ends);
  }
  if (payload.veg !== undefined) {
    target.veg = Boolean(payload.veg);
  }
  if (payload.status !== undefined) {
    target.status = Boolean(payload.status);
  }
}

export function serializeVendorFoodDetailFields(food: Record<string, unknown>) {
  return {
    discount: Number(food.discount ?? 0),
    discount_type: food.discount_type ?? 'percent',
    stock_type: normalizeStockType(food.stock_type),
    item_stock: food.item_stock != null ? Number(food.item_stock) : 0,
    available_time_starts: formatVendorFoodTimeForApi(food.available_time_starts),
    available_time_ends: formatVendorFoodTimeForApi(food.available_time_ends),
    veg: Boolean(food.veg),
    status: food.status !== false && food.status !== 0,
  };
}
