import { Request, Response } from 'express';
import prisma from '../../config/database';
import {
  adminDisbursementDetailQuerySchema,
  adminDisbursementDetailStatusSchema,
  adminDisbursementListQuerySchema,
  adminRestaurantDisbursementBulkStatusSchema,
} from '../../schemas/admin/Disbursement';
import { generateRestaurantDisbursement } from '../../utils/admin/disbursement/generateDisbursement';
import { listRestaurantDisbursementDetails } from '../../utils/admin/disbursement/listDisbursementDetails';
import {
  bulkUpdateRestaurantDisbursementStatus,
  updateRestaurantDisbursementDetailStatus,
} from '../../utils/admin/disbursement/restaurantDetailStatus';

function parseDetailQuery(req: Request) {
  const restaurant_id =
    req.query.restaurant_id === 'all' ? 'all' : Number(req.query.restaurant_id);
  const payment_method_id =
    req.query.payment_method_id === 'all' ? 'all' : Number(req.query.payment_method_id);
  return {
    search: req.query.search,
    entity_id: Number.isNaN(restaurant_id as number) ? 'all' : restaurant_id,
    payment_method_id: Number.isNaN(payment_method_id as number) ? 'all' : payment_method_id,
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 15,
  };
}

/**
 * @Route POST /api/admin/disbursement/restaurant/generate
 */
export const generateAdminRestaurantDisbursement = async (
  _req: Request,
  res: Response
): Promise<any> => {
  try {
    const result = await generateRestaurantDisbursement();
    return res.status(result.created ? 201 : 200).json({
      status: result.created,
      msg: result.msg,
      data: result.data,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Generate failed';
    return res.status(400).json({ status: false, msg });
  }
};

/**
 * @Route GET /api/admin/disbursement/restaurant/list
 */
export const listRestaurantDisbursements = async (req: Request, res: Response): Promise<any> => {
  const validated = adminDisbursementListQuerySchema.validate(req.query, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  const { status, page, limit } = validated.value;
  const skip = (page - 1) * limit;

  try {
    const where = {
      created_for: 'restaurant',
      ...(status !== 'all' ? { status } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.disbursements.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take: limit,
      }),
      prisma.disbursements.count({ where }),
    ]);
    const data = rows.map((r) => ({
      id: Number(r.id),
      title: r.title,
      description: r.description,
      total_amount: r.total_amount,
      status: r.status,
      created_for: r.created_for,
      created_at: r.created_at,
    }));
    return res.status(200).json({
      status: true,
      msg: 'Success',
      data: { data, total, page, limit },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'List failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Route GET /api/admin/disbursement/restaurant/:id
 */
export const getRestaurantDisbursement = async (req: Request, res: Response): Promise<any> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ status: false, msg: 'Invalid id' });
  }
  const validated = adminDisbursementDetailQuerySchema.validate(parseDetailQuery(req), {
    stripUnknown: true,
  });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }

  try {
    const batch = await prisma.disbursements.findFirst({
      where: { id: BigInt(id), created_for: 'restaurant' },
    });
    if (!batch) {
      return res.status(404).json({ status: false, msg: 'Disbursement not found' });
    }

    const { page, limit, search, entity_id, payment_method_id } = validated.value;
    const { data: details, total: detailsTotal } = await listRestaurantDisbursementDetails(id, {
      page,
      limit,
      search,
      entity_id: entity_id === 'all' ? 'all' : Number(entity_id),
      payment_method_id: payment_method_id === 'all' ? 'all' : Number(payment_method_id),
    });

    const paymentMethods = await prisma.withdrawal_methods.findMany({
      where: { is_active: 1 },
      select: { id: true, method_name: true },
      orderBy: { method_name: 'asc' },
    });

    return res.status(200).json({
      status: true,
      msg: 'Success',
      data: {
        disbursement: {
          id: Number(batch.id),
          title: batch.title,
          total_amount: batch.total_amount,
          status: batch.status,
          created_at: batch.created_at,
        },
        details,
        total: detailsTotal,
        page,
        limit,
        payment_methods: paymentMethods.map((m) => ({
          id: Number(m.id),
          method_name: m.method_name,
        })),
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Fetch failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Route PATCH /api/admin/disbursement/restaurant/details/:detailId/status
 */
export const patchRestaurantDisbursementDetailStatus = async (
  req: Request,
  res: Response
): Promise<any> => {
  const detailId = Number(req.params.detailId);
  if (!Number.isFinite(detailId)) {
    return res.status(400).json({ status: false, msg: 'Invalid detail id' });
  }
  const validated = adminDisbursementDetailStatusSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }

  const result = await updateRestaurantDisbursementDetailStatus(
    detailId,
    validated.value.status
  );
  if (!result.ok) {
    return res.status(400).json({ status: false, msg: result.msg });
  }
  return res.status(200).json({ status: true, msg: 'Status updated' });
};

/**
 * @Route POST /api/admin/disbursement/restaurant/details/bulk-status
 */
export const bulkRestaurantDisbursementStatus = async (
  req: Request,
  res: Response
): Promise<any> => {
  const validated = adminRestaurantDisbursementBulkStatusSchema.validate(req.body, {
    stripUnknown: true,
  });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  const { disbursement_id, restaurant_ids, status } = validated.value;
  const result = await bulkUpdateRestaurantDisbursementStatus(
    disbursement_id,
    restaurant_ids,
    status
  );
  if (!result.ok) {
    return res.status(400).json({ status: false, msg: result.msg });
  }
  return res.status(200).json({ status: true, msg: 'Status updated' });
};
