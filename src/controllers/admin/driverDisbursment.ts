import { Request, Response } from 'express';
import prisma from '../../config/database';
import {
  adminDisbursementDetailQuerySchema,
  adminDisbursementDetailStatusSchema,
  adminDisbursementListQuerySchema,
  adminDmDisbursementBulkStatusSchema,
} from '../../schemas/admin/Disbursement';
import {
  bulkUpdateDmDisbursementStatus,
  updateDmDisbursementDetailStatus,
} from '../../utils/admin/disbursement/dmDetailStatus';
import { generateDeliveryManDisbursement } from '../../utils/admin/disbursement/generateDisbursement';
import { listDmDisbursementDetails } from '../../utils/admin/disbursement/listDisbursementDetails';

function parseDetailQuery(req: Request) {
  const delivery_man_id =
    req.query.delivery_man_id === 'all' ? 'all' : Number(req.query.delivery_man_id);
  const payment_method_id =
    req.query.payment_method_id === 'all' ? 'all' : Number(req.query.payment_method_id);
  return {
    search: req.query.search,
    entity_id: Number.isNaN(delivery_man_id as number) ? 'all' : delivery_man_id,
    payment_method_id: Number.isNaN(payment_method_id as number) ? 'all' : payment_method_id,
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 15,
  };
}

/**
 * @Route POST /api/admin/disbursement/delivery-man/generate
 */
export const generateAdminDeliveryManDisbursement = async (
  _req: Request,
  res: Response
): Promise<any> => {
  try {
    const result = await generateDeliveryManDisbursement();
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
 * @Route GET /api/admin/disbursement/delivery-man/list
 */
export const listDeliveryManDisbursements = async (req: Request, res: Response): Promise<any> => {
  const validated = adminDisbursementListQuerySchema.validate(req.query, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  const { status, page, limit } = validated.value;
  const skip = (page - 1) * limit;

  try {
    const where = {
      created_for: 'delivery_man',
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
 * @Route GET /api/admin/disbursement/delivery-man/:id
 */
export const getDeliveryManDisbursement = async (req: Request, res: Response): Promise<any> => {
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
      where: { id: BigInt(id), created_for: 'delivery_man' },
    });
    if (!batch) {
      return res.status(404).json({ status: false, msg: 'Disbursement not found' });
    }

    const { page, limit, search } = validated.value;
    const delivery_man_id = validated.value.delivery_man_id;
    const payment_method_id = validated.value.payment_method_id;

    const { data: details, total: detailsTotal } = await listDmDisbursementDetails(id, {
      page,
      limit,
      search,
      entity_id: delivery_man_id === 'all' ? 'all' : Number(delivery_man_id),
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
 * @Route PATCH /api/admin/disbursement/delivery-man/details/:detailId/status
 */
export const patchDeliveryManDisbursementDetailStatus = async (
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

  const result = await updateDmDisbursementDetailStatus(detailId, validated.value.status);
  if (!result.ok) {
    return res.status(400).json({ status: false, msg: result.msg });
  }
  return res.status(200).json({ status: true, msg: 'Status updated' });
};

/**
 * @Route POST /api/admin/disbursement/delivery-man/details/bulk-status
 */
export const bulkDeliveryManDisbursementStatus = async (
  req: Request,
  res: Response
): Promise<any> => {
  const validated = adminDmDisbursementBulkStatusSchema.validate(req.body, {
    stripUnknown: true,
  });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  const { disbursement_id, delivery_man_ids, status } = validated.value;
  const result = await bulkUpdateDmDisbursementStatus(disbursement_id, delivery_man_ids, status);
  if (!result.ok) {
    return res.status(400).json({ status: false, msg: result.msg });
  }
  return res.status(200).json({ status: true, msg: 'Status updated' });
};
