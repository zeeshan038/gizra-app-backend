import { Request } from 'express';
import { Prisma } from '@prisma/client';

export type ReportListQuery = {
  from?: string;
  to?: string;
  zone_id?: number;
  restaurant_id?: number;
  customer_id?: number;
  delivery_man_id?: number;
  campaign_id?: number;
  expense_type?: string;
  status?: string;
  payment_method_id?: number;
  search?: string;
  page?: number;
  limit?: number;
  vendor_id?: number;
};

export function parseOptionalEntityId(raw: unknown): number | undefined {
  if (raw == null || raw === '' || raw === 'all') return undefined;
  const n = Number(raw);
  return Number.isNaN(n) ? undefined : n;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseReportDate(value?: string, endOfDay = false): Date | undefined {
  const s = value?.trim();
  if (!s || !ISO_DATE.test(s)) return undefined;
  const d = new Date(`${s}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function createdAtRange(from?: string, to?: string) {
  const gte = parseReportDate(from, false);
  const lte = parseReportDate(to, true);
  if (!gte && !lte) return undefined;
  if (gte && lte && gte > lte) return undefined;
  const range: { gte?: Date; lte?: Date } = {};
  if (gte) range.gte = gte;
  if (lte) range.lte = lte;
  return range;
}

export function buildOrdersWhere(
  query: ReportListQuery,
  opts?: { dateField?: 'created_at' | 'schedule_at' }
): Prisma.ordersWhereInput {
  const and: Prisma.ordersWhereInput[] = [{ NOT: { order_type: 'pos' } }];
  const range = createdAtRange(query.from, query.to);
  const dateField = opts?.dateField ?? 'created_at';
  if (range) and.push({ [dateField]: range });
  if (query.zone_id != null) {
    and.push({ zone_id: { equals: query.zone_id } });
  }
  if (query.restaurant_id != null) {
    and.push({ restaurant_id: { equals: query.restaurant_id } });
  }
  if (query.customer_id != null) {
    and.push({ user_id: { equals: query.customer_id } });
  }
  if (query.search?.trim()) {
    const tokens = query.search.trim().split(/\s+/).filter(Boolean);
    and.push({
      OR: tokens.flatMap((t) => {
        const asNum = Number(t);
        const parts: Prisma.ordersWhereInput[] = [];
        if (!Number.isNaN(asNum)) parts.push({ id: BigInt(asNum) });
        return parts;
      }),
    });
  }
  return { AND: and };
}

export function parseAdminReportListQuery(req: Request): ReportListQuery {
  return {
    from: req.query.from ? String(req.query.from) : undefined,
    to: req.query.to ? String(req.query.to) : undefined,
    zone_id: parseOptionalEntityId(req.query.zone_id),
    restaurant_id: parseOptionalEntityId(req.query.restaurant_id),
    customer_id: parseOptionalEntityId(req.query.customer_id),
    delivery_man_id: parseOptionalEntityId(req.query.delivery_man_id),
    campaign_id: parseOptionalEntityId(req.query.campaign_id),
    expense_type: req.query.expense_type ? String(req.query.expense_type) : undefined,
    status: req.query.status ? String(req.query.status) : undefined,
    payment_method_id: parseOptionalEntityId(req.query.payment_method_id),
    search: req.query.search ? String(req.query.search) : undefined,
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 25,
  };
}

export function parseVendorReportListQuery(req: Request): ReportListQuery {
  return {
    from: req.query.from ? String(req.query.from) : undefined,
    to: req.query.to ? String(req.query.to) : undefined,
    campaign_id: parseOptionalEntityId(req.query.campaign_id),
    expense_type: req.query.expense_type ? String(req.query.expense_type) : undefined,
    status: req.query.status ? String(req.query.status) : undefined,
    search: req.query.search ? String(req.query.search) : undefined,
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 25,
  };
}
