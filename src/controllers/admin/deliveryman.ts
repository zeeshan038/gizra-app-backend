import { Request, Response } from 'express';
import prisma from '../../config/database';
import {
  adminDeliveryManApplicationSchema,
  adminDeliveryManBonusSchema,
  adminDeliveryManJoinQuerySchema,
  adminDeliveryManListQuerySchema,
  adminDeliveryManStatusSchema,
  adminIncentiveApproveAllSchema,
  adminIncentiveDenySchema,
  adminListQuerySchema,
  adminReviewStatusSchema,
} from '../../schemas/admin/DeliveryMan';
import { dmWalletTransaction } from '../../utils/admin/deliverymen/dmWalletTransaction';
import { listDeliveryMenAdmin } from '../../utils/admin/deliverymen/listDeliveryMenAdmin';
import { sendDeliveryManRegistrationDecisionPush } from '../../utils/notifications/sendRegistrationDecisionPush';

function parseDmListQuery(req: Request) {
  const raw = {
    search: req.query.search,
    zone_id: req.query.zone_id === 'all' ? 'all' : Number(req.query.zone_id),
    vehicle_id: req.query.vehicle_id === 'all' ? 'all' : Number(req.query.vehicle_id),
    job_type: req.query.job_type ?? 'all',
    application_status: req.query.application_status ?? 'approved',
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 15,
  };
  if (Number.isNaN(raw.zone_id as number)) raw.zone_id = 'all';
  if (Number.isNaN(raw.vehicle_id as number)) raw.vehicle_id = 'all';
  return raw;
}

function parsePagedQuery(req: Request) {
  return {
    search: req.query.search,
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 15,
  };
}

async function deliveryManIdsMatchingSearch(search?: string): Promise<number[] | undefined> {
  const tokens = search?.trim() ? search.trim().split(/\s+/).filter(Boolean) : [];
  if (!tokens.length) return undefined;
  const rows = await prisma.delivery_men.findMany({
    where: {
      type: 'zone_wise',
      OR: tokens.flatMap((t) => [
        { f_name: { contains: t, mode: 'insensitive' } },
        { l_name: { contains: t, mode: 'insensitive' } },
        { phone: { contains: t, mode: 'insensitive' } },
        { email: { contains: t, mode: 'insensitive' } },
      ]),
    },
    select: { id: true },
    take: 500,
  });
  return rows.map((r) => Number(r.id));
}

/**
 * @Route GET /api/admin/delivery-men/list
 */
export const listAdminDeliveryMen = async (req: Request, res: Response): Promise<any> => {
  const validated = adminDeliveryManListQuerySchema.validate(
    { ...parseDmListQuery(req), application_status: 'approved' },
    { stripUnknown: true }
  );
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    const result = await listDeliveryMenAdmin(validated.value);
    return res.status(200).json({ status: true, msg: 'Success', data: result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'List failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Route GET /api/admin/delivery-men/join-requests
 */
export const listAdminDeliveryManJoinRequests = async (req: Request, res: Response): Promise<any> => {
  const parsed = parseDmListQuery(req);
  const validated = adminDeliveryManJoinQuerySchema.validate(
    {
      tab: req.query.tab ?? 'pending',
      search: parsed.search,
      zone_id: parsed.zone_id,
      vehicle_id: parsed.vehicle_id,
      job_type: parsed.job_type,
      page: parsed.page,
      limit: parsed.limit,
    },
    { stripUnknown: true }
  );
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    const tab = validated.value.tab ?? 'pending';
    const result = await listDeliveryMenAdmin({
      ...validated.value,
      application_status: tab === 'denied' ? 'denied' : 'pending',
    });
    return res.status(200).json({ status: true, msg: 'Success', data: result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'List failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Route GET /api/admin/delivery-men/select
 */
export const selectAdminDeliveryMen = async (req: Request, res: Response): Promise<any> => {
  const q = String(req.query.q ?? '').trim();
  try {
    const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
    const where =
      tokens.length > 0
        ? {
            type: 'zone_wise',
            application_status: 'approved' as const,
            OR: tokens.flatMap((t) => [
              { f_name: { contains: t, mode: 'insensitive' as const } },
              { l_name: { contains: t, mode: 'insensitive' as const } },
              { phone: { contains: t, mode: 'insensitive' as const } },
              { email: { contains: t, mode: 'insensitive' as const } },
            ]),
          }
        : { type: 'zone_wise', application_status: 'approved' as const };

    const rows = await prisma.delivery_men.findMany({
      where,
      take: 8,
      orderBy: { id: 'desc' },
      select: { id: true, f_name: true, l_name: true, phone: true },
    });
    const data = rows.map((u) => {
      const name = [u.f_name, u.l_name].filter(Boolean).join(' ');
      const phone = u.phone ?? '';
      return {
        id: Number(u.id),
        text: name ? `${name} (${phone})` : phone,
        name,
        phone,
      };
    });
    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Select failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Route PATCH /api/admin/delivery-men/:id/application
 */
export const updateAdminDeliveryManApplication = async (req: Request, res: Response): Promise<any> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ status: false, msg: 'Invalid id' });
  }
  const validated = adminDeliveryManApplicationSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    const status = validated.value.status;
    await prisma.delivery_men.update({
      where: { id: BigInt(id) },
      data: {
        application_status: status,
        ...(status === 'approved' ? { status: true } : {}),
        updated_at: new Date(),
      },
    });

    if (status === 'approved' || status === 'denied') {
      void sendDeliveryManRegistrationDecisionPush(id, status).catch((err) =>
        console.error('[notify] delivery man registration push failed', err)
      );
    }

    return res.status(200).json({ status: true, msg: 'Application status updated' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Update failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Route PATCH /api/admin/delivery-men/:id/status
 */
export const updateAdminDeliveryManStatus = async (req: Request, res: Response): Promise<any> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ status: false, msg: 'Invalid id' });
  }
  const validated = adminDeliveryManStatusSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    const active = validated.value.status;
    await prisma.delivery_men.update({
      where: { id: BigInt(id) },
      data: {
        status: active,
        ...(active ? {} : { auth_token: null }),
        updated_at: new Date(),
      },
    });
    return res.status(200).json({ status: true, msg: 'Delivery man status updated' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Update failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Route GET /api/admin/delivery-men/reviews
 */
export const listAdminDeliveryManReviews = async (req: Request, res: Response): Promise<any> => {
  const validated = adminListQuerySchema.validate(parsePagedQuery(req), { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  const { search, page, limit } = validated.value;
  const skip = ((page ?? 1) - 1) * (limit ?? 15);

  try {
    const dmIds = await deliveryManIdsMatchingSearch(search);
    if (dmIds && dmIds.length === 0) {
      return res.status(200).json({
        status: true,
        msg: 'Success',
        data: { data: [], total: 0, page, limit },
      });
    }

    const where = {
      ...(dmIds ? { delivery_man_id: { in: dmIds } } : {}),
    };

    const [reviews, total] = await Promise.all([
      prisma.d_m_reviews.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take: limit,
      }),
      prisma.d_m_reviews.count({ where }),
    ]);

    const dmIdSet = [...new Set(reviews.map((r) => Number(r.delivery_man_id)))];
    const userIdSet = [...new Set(reviews.map((r) => Number(r.user_id)))];

    const [dms, users] = await Promise.all([
      dmIdSet.length
        ? prisma.delivery_men.findMany({
            where: { id: { in: dmIdSet.map((id) => BigInt(id)) } },
            select: { id: true, f_name: true, l_name: true, type: true },
          })
        : [],
      userIdSet.length
        ? prisma.users.findMany({
            where: { id: { in: userIdSet.map((id) => BigInt(id)) } },
            select: { id: true, f_name: true, l_name: true },
          })
        : [],
    ]);

    const dmMap = new Map(dms.map((d) => [Number(d.id), d]));
    const userMap = new Map(users.map((u) => [Number(u.id), u]));

    const data = reviews
      .filter((r) => {
        const dm = dmMap.get(Number(r.delivery_man_id));
        return dm?.type === 'zone_wise';
      })
      .map((r) => {
        const dm = dmMap.get(Number(r.delivery_man_id));
        const user = userMap.get(Number(r.user_id));
        const dmName = dm ? [dm.f_name, dm.l_name].filter(Boolean).join(' ') : '—';
        const customerName = user ? [user.f_name, user.l_name].filter(Boolean).join(' ') : '—';
        return {
          id: Number(r.id),
          delivery_man_id: Number(r.delivery_man_id),
          user_id: Number(r.user_id),
          order_id: Number(r.order_id),
          rating: Number(r.rating),
          comment: r.comment,
          status: r.status,
          created_at: r.created_at,
          dm: dmName,
          customer: customerName,
        };
      });

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
 * @Route PATCH /api/admin/delivery-men/reviews/:id/status
 */
export const updateAdminDeliveryManReviewStatus = async (req: Request, res: Response): Promise<any> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ status: false, msg: 'Invalid id' });
  }
  const validated = adminReviewStatusSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    await prisma.d_m_reviews.update({
      where: { id: BigInt(id) },
      data: { status: validated.value.status, updated_at: new Date() },
    });
    return res.status(200).json({ status: true, msg: 'Review visibility updated' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Update failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Route GET /api/admin/delivery-men/incentives/pending
 */
export const listAdminPendingIncentives = async (req: Request, res: Response): Promise<any> => {
  return listIncentiveLogs(req, res, 'pending');
};

/**
 * @Route GET /api/admin/delivery-men/incentives/history
 */
export const listAdminIncentiveHistory = async (req: Request, res: Response): Promise<any> => {
  return listIncentiveLogs(req, res, 'history');
};

async function listIncentiveLogs(req: Request, res: Response, mode: 'pending' | 'history'): Promise<any> {
  const validated = adminListQuerySchema.validate(parsePagedQuery(req), { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  const { search, page, limit } = validated.value;
  const skip = ((page ?? 1) - 1) * (limit ?? 15);

  try {
    const dmIds = await deliveryManIdsMatchingSearch(search);
    if (dmIds && dmIds.length === 0) {
      return res.status(200).json({
        status: true,
        msg: 'Success',
        data: { data: [], total: 0, page, limit },
      });
    }

    const where = {
      ...(mode === 'pending' ? { status: 'pending' } : { NOT: { status: 'pending' } }),
      ...(dmIds ? { delivery_man_id: { in: dmIds } } : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.incentive_logs.findMany({ where, orderBy: { id: 'desc' }, skip, take: limit }),
      prisma.incentive_logs.count({ where }),
    ]);

    const dmIdSet = [...new Set(rows.map((r) => Number(r.delivery_man_id)))];
    const zoneIdSet = [...new Set(rows.map((r) => Number(r.zone_id)))];

    const [dms, zones] = await Promise.all([
      dmIdSet.length
        ? prisma.delivery_men.findMany({
            where: { id: { in: dmIdSet.map((id) => BigInt(id)) } },
            select: { id: true, f_name: true, l_name: true, phone: true },
          })
        : [],
      zoneIdSet.length
        ? prisma.zones.findMany({
            where: { id: { in: zoneIdSet.map((id) => BigInt(id)) } },
            select: { id: true, name: true },
          })
        : [],
    ]);

    const dmMap = new Map(dms.map((d) => [Number(d.id), d]));
    const zoneMap = new Map(zones.map((z) => [Number(z.id), z.name]));

    const data = rows.map((r) => {
      const dm = dmMap.get(Number(r.delivery_man_id));
      return {
        id: Number(r.id),
        delivery_man_id: Number(r.delivery_man_id),
        zone_id: Number(r.zone_id),
        zone: zoneMap.get(Number(r.zone_id)) ?? null,
        name: dm ? [dm.f_name, dm.l_name].filter(Boolean).join(' ') : '—',
        phone: dm?.phone ?? null,
        earning: Number(r.earning),
        incentive: Number(r.incentive),
        today_earning: Number(r.today_earning),
        working_hours: Number(r.working_hours),
        date: r.date,
        status: r.status,
        created_at: r.created_at,
      };
    });

    return res.status(200).json({
      status: true,
      msg: 'Success',
      data: { data, total, page, limit },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'List failed';
    return res.status(500).json({ status: false, msg });
  }
}

/**
 * @Route PUT /api/admin/delivery-men/incentives/:id
 */
export const denyAdminIncentive = async (req: Request, res: Response): Promise<any> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ status: false, msg: 'Invalid id' });
  }
  const validated = adminIncentiveDenySchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    const row = await prisma.incentive_logs.findUnique({ where: { id: BigInt(id) } });
    if (!row || row.status !== 'pending') {
      return res.status(400).json({ status: false, msg: 'Incentive is not pending' });
    }
    await prisma.incentive_logs.update({
      where: { id: BigInt(id) },
      data: { status: 'denied', updated_at: new Date() },
    });
    return res.status(200).json({ status: true, msg: 'Incentive denied' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Update failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Route POST /api/admin/delivery-men/incentives/approve-all
 */
export const approveAllAdminIncentives = async (req: Request, res: Response): Promise<any> => {
  const validated = adminIncentiveApproveAllSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    const ids = validated.value.incentive_id;
    const rows = await prisma.incentive_logs.findMany({
      where: { id: { in: ids.map((i: number) => BigInt(i)) }, status: 'pending' },
    });
    for (const row of rows) {
      const amount = Number(row.incentive);
      const ok = await dmWalletTransaction(Number(row.delivery_man_id), amount, null, 'incentive');
      if (!ok) {
        return res.status(500).json({ status: false, msg: 'Failed to create wallet transaction' });
      }
      await prisma.incentive_logs.update({
        where: { id: row.id },
        data: { status: 'approved', updated_at: new Date() },
      });
    }
    return res.status(200).json({ status: true, msg: 'Incentives approved' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Approve failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Route GET /api/admin/delivery-men/bonus
 */
export const listAdminDeliveryManBonus = async (req: Request, res: Response): Promise<any> => {
  const validated = adminListQuerySchema.validate(parsePagedQuery(req), { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  const { search, page, limit } = validated.value;
  const skip = ((page ?? 1) - 1) * (limit ?? 15);

  try {
    const tokens = search?.trim() ? search.trim().split(/\s+/).filter(Boolean) : [];
    let dmIds: number[] | undefined;
    if (tokens.length) {
      dmIds = await deliveryManIdsMatchingSearch(search);
    }

    const or: object[] = [];
    if (tokens.length) {
      or.push({
        OR: tokens.map((t: string) => ({ transaction_id: { contains: t, mode: 'insensitive' } })),
      });
      if (dmIds?.length) {
        or.push({ delivery_man_id: { in: dmIds } });
      }
    }

    const where = {
      transaction_type: 'dm_admin_bonus',
      ...(or.length ? { OR: or } : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.wallet_transactions.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take: limit,
      }),
      prisma.wallet_transactions.count({ where }),
    ]);

    const dmIdSet = [
      ...new Set(rows.map((r) => (r.delivery_man_id != null ? Number(r.delivery_man_id) : null)).filter(Boolean)),
    ] as number[];

    const dms =
      dmIdSet.length > 0
        ? await prisma.delivery_men.findMany({
            where: { id: { in: dmIdSet.map((id) => BigInt(id)) } },
            select: { id: true, f_name: true, l_name: true, phone: true },
          })
        : [];
    const dmMap = new Map(dms.map((d) => [Number(d.id), d]));

    const data = rows.map((r) => {
      const dm = r.delivery_man_id != null ? dmMap.get(Number(r.delivery_man_id)) : undefined;
      return {
        id: Number(r.id),
        transaction_id: r.transaction_id,
        delivery_man_id: r.delivery_man_id != null ? Number(r.delivery_man_id) : null,
        name: dm ? [dm.f_name, dm.l_name].filter(Boolean).join(' ') : '—',
        phone: dm?.phone ?? null,
        amount: Number(r.credit),
        reference: r.reference,
        created_at: r.created_at,
      };
    });

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
 * @Route POST /api/admin/delivery-men/bonus
 */
export const addAdminDeliveryManBonus = async (req: Request, res: Response): Promise<any> => {
  const validated = adminDeliveryManBonusSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  const { delivery_man_id, amount, referance } = validated.value;
  try {
    const exists = await prisma.delivery_men.findUnique({
      where: { id: BigInt(delivery_man_id) },
      select: { id: true },
    });
    if (!exists) {
      return res.status(404).json({ status: false, msg: 'Delivery man not found' });
    }
    const ok = await dmWalletTransaction(delivery_man_id, amount, referance ?? null, 'dm_admin_bonus');
    if (!ok) {
      return res.status(500).json({ status: false, msg: 'Failed to create transaction' });
    }
    return res.status(200).json({ status: true, msg: 'Bonus added successfully' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Bonus failed';
    return res.status(500).json({ status: false, msg });
  }
};
