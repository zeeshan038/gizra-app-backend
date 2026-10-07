import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { getVendorContext } from '../../utils/vendor/context';
import {
  createVendorCouponSchema,
  updateVendorCouponSchema,
  vendorCouponListQuerySchema,
  vendorCouponStatusSchema,
} from '../../schemas/vendor/coupons';
import {
  deleteCouponTranslations,
  loadCouponTitleTranslations,
  normalizeDiscountType,
  upsertCouponTitleTranslations,
} from '../../utils/vendor/coupon/translations';

function vendorCouponScope(restaurantId: number): Prisma.couponsWhereInput {
  return { created_by: 'vendor', restaurant_id: restaurantId };
}

function formatCouponRow(
  row: Awaited<ReturnType<typeof prisma.coupons.findFirst>> & object,
  titles?: { default: string; en: string; he: string }
) {
  if (!row) return null;
  return {
    id: Number(row.id),
    title: row.title,
    titles: titles ?? { default: row.title ?? '', en: row.title ?? '', he: row.title ?? '' },
    code: row.code,
    coupon_type: row.coupon_type,
    limit: row.limit != null ? Number(row.limit) : null,
    start_date: row.start_date,
    expire_date: row.expire_date,
    min_purchase: Number(row.min_purchase),
    max_discount: Number(row.max_discount),
    discount: Number(row.discount),
    discount_type: row.discount_type,
    status: row.status,
    total_uses: row.total_uses != null ? Number(row.total_uses) : 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function assertOwnedCoupon(id: number, restaurantId: number) {
  return prisma.coupons.findFirst({
    where: { id: BigInt(id), ...vendorCouponScope(restaurantId) },
  });
}

/**
 * @Description Vendor coupon list
 * @Route GET /api/vendor/coupons
 * @Access Vendor
 */
export const listVendorCoupons = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) {
    return res.status(403).json({ status: false, msg: 'Restaurant context not found for vendor' });
  }

  const validated = vendorCouponListQuerySchema.validate(req.query, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(', '),
    });
  }

  const { search, limit, offset } = validated.value as {
    search?: string;
    limit: number;
    offset: number;
  };

  const where: Prisma.couponsWhereInput = vendorCouponScope(ctx.restaurantId);
  if (search?.trim()) {
    const q = search.trim();
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { code: { contains: q, mode: 'insensitive' } },
    ];
  }

  try {
    const [total, rows] = await Promise.all([
      prisma.coupons.count({ where }),
      prisma.coupons.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: limit,
      }),
    ]);

    const coupons = await Promise.all(
      rows.map(async (row) => {
        const titles = await loadCouponTitleTranslations(row.id, row.title);
        return formatCouponRow(row, titles);
      })
    );

    return res.status(200).json({
      status: true,
      data: { total, limit, offset, coupons },
    });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Create vendor coupon
 * @Route POST /api/vendor/coupons
 * @Access Vendor
 */
export const createVendorCoupon = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) {
    return res.status(403).json({ status: false, msg: 'Restaurant context not found for vendor' });
  }

  const validated = createVendorCouponSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(', '),
    });
  }

  const body = validated.value as {
    titles: { default: string; en?: string; he?: string };
    code: string;
    coupon_type: string;
    limit?: number | null;
    start_date: Date;
    expire_date: Date;
    discount: number;
    discount_type: string;
    max_discount: number;
    min_purchase: number;
  };

  try {
    const duplicate = await prisma.coupons.findFirst({ where: { code: body.code } });
    if (duplicate) {
      return res.status(400).json({ status: false, msg: 'Coupon code already exists' });
    }

    const limit =
      body.coupon_type === 'first_order' ? 1 : body.limit != null ? BigInt(body.limit) : null;

    const created = await prisma.coupons.create({
      data: {
        title: body.titles.default,
        code: body.code,
        coupon_type: body.coupon_type,
        limit,
        start_date: body.start_date,
        expire_date: body.expire_date,
        min_purchase: body.min_purchase,
        max_discount: body.max_discount,
        discount: body.discount,
        discount_type: normalizeDiscountType(body.discount_type),
        status: true,
        created_by: 'vendor',
        restaurant_id: ctx.restaurantId,
        data: JSON.stringify(''),
        customer_id: JSON.stringify(['all']),
        created_at: new Date(),
        updated_at: new Date(),
      },
    });

    await upsertCouponTitleTranslations(created.id, body.titles);
    const titles = await loadCouponTitleTranslations(created.id, created.title);

    return res.status(201).json({
      status: true,
      msg: 'Coupon added successfully',
      data: formatCouponRow(created, titles),
    });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Update vendor coupon
 * @Route PUT /api/vendor/coupons/:id
 * @Access Vendor
 */
export const updateVendorCoupon = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) {
    return res.status(403).json({ status: false, msg: 'Restaurant context not found for vendor' });
  }

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ status: false, msg: 'Invalid coupon id' });
  }

  const validated = updateVendorCouponSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(', '),
    });
  }

  const body = validated.value as {
    titles: { default: string; en?: string; he?: string };
    code: string;
    coupon_type: string;
    limit?: number | null;
    start_date: Date;
    expire_date: Date;
    discount: number;
    discount_type: string;
    max_discount: number;
    min_purchase: number;
  };

  try {
    const existing = await assertOwnedCoupon(id, ctx.restaurantId);
    if (!existing) {
      return res.status(404).json({ status: false, msg: 'Coupon not found' });
    }

    const codeTaken = await prisma.coupons.findFirst({
      where: { code: body.code, NOT: { id: BigInt(id) } },
    });
    if (codeTaken) {
      return res.status(400).json({ status: false, msg: 'Coupon code already exists' });
    }

    const limit =
      body.coupon_type === 'first_order' ? 1 : body.limit != null ? BigInt(body.limit) : null;

    const updated = await prisma.coupons.update({
      where: { id: BigInt(id) },
      data: {
        title: body.titles.default,
        code: body.code,
        coupon_type: body.coupon_type,
        limit,
        start_date: body.start_date,
        expire_date: body.expire_date,
        min_purchase: body.min_purchase,
        max_discount: body.max_discount,
        discount: body.discount,
        discount_type: normalizeDiscountType(body.discount_type),
        updated_at: new Date(),
      },
    });

    await upsertCouponTitleTranslations(updated.id, body.titles);
    const titles = await loadCouponTitleTranslations(updated.id, updated.title);

    return res.status(200).json({
      status: true,
      msg: 'Coupon updated successfully',
      data: formatCouponRow(updated, titles),
    });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Toggle coupon status
 * @Route PATCH /api/vendor/coupons/:id/status
 * @Access Vendor
 */
export const setVendorCouponStatus = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) {
    return res.status(403).json({ status: false, msg: 'Restaurant context not found for vendor' });
  }

  const id = Number(req.params.id);
  const validated = vendorCouponStatusSchema.validate(req.body, { stripUnknown: true });
  if (validated.error || !Number.isFinite(id)) {
    return res.status(400).json({ status: false, msg: 'Invalid request' });
  }

  try {
    const existing = await assertOwnedCoupon(id, ctx.restaurantId);
    if (!existing) {
      return res.status(404).json({ status: false, msg: 'Coupon not found' });
    }

    const updated = await prisma.coupons.update({
      where: { id: BigInt(id) },
      data: { status: validated.value.status, updated_at: new Date() },
    });

    return res.status(200).json({
      status: true,
      msg: 'Coupon status updated',
      data: { id: Number(updated.id), status: updated.status },
    });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Delete vendor coupon
 * @Route DELETE /api/vendor/coupons/:id
 * @Access Vendor
 */
export const deleteVendorCoupon = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) {
    return res.status(403).json({ status: false, msg: 'Restaurant context not found for vendor' });
  }

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ status: false, msg: 'Invalid coupon id' });
  }

  try {
    const existing = await assertOwnedCoupon(id, ctx.restaurantId);
    if (!existing) {
      return res.status(404).json({ status: false, msg: 'Coupon not found' });
    }

    await deleteCouponTranslations(existing.id);
    await prisma.coupons.delete({ where: { id: existing.id } });

    return res.status(200).json({ status: true, msg: 'Coupon deleted successfully' });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};
