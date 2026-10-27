import { Prisma } from '@prisma/client';

export function toNum(v: bigint | number | Prisma.Decimal | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'number') return v;
  return Number(v.toString());
}

export function paginationFromPage(limit: number, page: number): { take: number; skip: number } {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const safePage = Math.max(page, 1);
  return { take: safeLimit, skip: (safePage - 1) * safeLimit };
}
