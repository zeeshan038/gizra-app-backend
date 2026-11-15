import prisma from '../../config/database';

/** Per-unit add-on total (price × qty), ignoring placement surcharges (display-only pizza halves). */
export async function sumCartLineAddonUnitTotal(
  addOnIds: number[],
  addOnQtys: number[]
): Promise<number> {
  if (!addOnIds.length) return 0;
  const addons = await prisma.add_ons.findMany({
    where: { id: { in: addOnIds.map((id) => BigInt(id)) }, status: true },
    select: { id: true, price: true },
  });
  let total = 0;
  for (let i = 0; i < addOnIds.length; i++) {
    const addon = addons.find((a) => Number(a.id) === addOnIds[i]);
    if (!addon) continue;
    const qty = addOnQtys[i] ?? 1;
    total += Number(addon.price) * qty;
  }
  return Math.round(total * 100) / 100;
}

export async function batchCartLineAddonUnitTotals(
  lines: Array<{ add_on_ids: number[]; add_on_qtys: number[] }>
): Promise<number[]> {
  const allIds = [...new Set(lines.flatMap((l) => l.add_on_ids ?? []))];
  const addonById = new Map<number, number>();
  if (allIds.length) {
    const addons = await prisma.add_ons.findMany({
      where: { id: { in: allIds.map((id) => BigInt(id)) }, status: true },
      select: { id: true, price: true },
    });
    for (const a of addons) {
      addonById.set(Number(a.id), Number(a.price));
    }
  }
  return lines.map((line) => {
    const ids = line.add_on_ids ?? [];
    const qtys = line.add_on_qtys ?? [];
    let total = 0;
    for (let i = 0; i < ids.length; i++) {
      const price = addonById.get(ids[i]);
      if (price == null) continue;
      total += price * (qtys[i] ?? 1);
    }
    return Math.round(total * 100) / 100;
  });
}