import { Request, Response } from 'express';
import Joi from 'joi';
import prisma from '../../config/database';
import {
  adminAddFundSchema,
  adminCustomerListQuerySchema,
  adminSubscriberListQuerySchema,
  adminWalletBonusCreateSchema,
  adminWalletReportQuerySchema,
} from '../../schemas/admin/Customer';
import { listCustomersAdmin } from '../../utils/admin/customers/listCustomersAdmin';
import { listSubscribersAdmin } from '../../utils/admin/customers/listSubscribersAdmin';
import { loyaltyReportAdmin } from '../../utils/admin/customers/loyaltyReportAdmin';
import { walletReportAdmin } from '../../utils/admin/customers/walletReportAdmin';
import { createWalletTransaction } from '../../utils/consumer/walletTransactions';

const WALLET_BONUS_TYPE = 'App\\Models\\WalletBonus';

function parseCustomerListQuery(req: Request) {
  const zoneRaw = req.query.zone_id;
  let zone_id: number | undefined;
  if (zoneRaw != null && zoneRaw !== '' && zoneRaw !== 'all') {
    const n = Number(zoneRaw);
    if (!Number.isNaN(n)) zone_id = n;
  }
  return {
    search: req.query.search,
    filter: req.query.filter,
    order_wise: req.query.order_wise,
    zone_id,
    order_date_from: req.query.order_date_from,
    order_date_to: req.query.order_date_to,
    join_date_from: req.query.join_date_from,
    join_date_to: req.query.join_date_to,
    show_limit: req.query.show_limit ? Number(req.query.show_limit) : undefined,
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 25,
  };
}

/**
 * @Route GET /api/admin/customers/list
 */
export const listAdminCustomers = async (req: Request, res: Response): Promise<any> => {
  const validated = adminCustomerListQuerySchema.validate(parseCustomerListQuery(req), {
    stripUnknown: true,
  });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    const result = await listCustomersAdmin(validated.value);
    return res.status(200).json({ status: true, msg: 'Success', data: result });
  } catch (e) {
    console.error('[admin/customers/list]', e);
    return res.status(500).json({ status: false, msg: 'Failed to load customers' });
  }
};

/**
 * @Route GET /api/admin/customers/select
 */
export const selectAdminCustomers = async (req: Request, res: Response): Promise<any> => {
  const q = String(req.query.q ?? '').trim();
  const includeAll = req.query.all === '1' || req.query.all === 'true';
  try {
    const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
    const where =
      tokens.length > 0
        ? {
            OR: tokens.flatMap((t) => [
              { f_name: { contains: t, mode: 'insensitive' as const } },
              { l_name: { contains: t, mode: 'insensitive' as const } },
              { phone: { contains: t, mode: 'insensitive' as const } },
            ]),
          }
        : {};
    const rows = await prisma.users.findMany({
      where,
      take: 8,
      orderBy: { created_at: 'desc' },
      select: { id: true, f_name: true, l_name: true, phone: true },
    });
    const data = rows.map((u) => {
      const name = [u.f_name, u.l_name].filter(Boolean).join(' ');
      const phone = u.phone ?? '';
      return {
        id: Number(u.id),
        text: `${name} (${phone})`.trim(),
      };
    });
    if (includeAll) data.unshift({ id: 0, text: 'All' });
    return res.status(200).json({ status: true, msg: 'Success', data: { data } });
  } catch (e) {
    console.error('[admin/customers/select]', e);
    return res.status(500).json({ status: false, msg: 'Failed to search customers' });
  }
};

/**
 * @Route PATCH /api/admin/customers/status/:id
 */
export const updateAdminCustomerStatus = async (req: Request, res: Response): Promise<any> => {
  const id = Number(req.params.id);
  const schema = Joi.object({ status: Joi.boolean().required() });
  const validated = schema.validate(req.body);
  if (!id || Number.isNaN(id)) {
    return res.status(400).json({ status: false, msg: 'Invalid customer id' });
  }
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    const updated = await prisma.users.update({
      where: { id: BigInt(id) },
      data: { status: validated.value.status, updated_at: new Date() },
      select: { id: true, status: true },
    });
    return res.status(200).json({
      status: true,
      data: { id: Number(updated.id), status: updated.status },
    });
  } catch {
    return res.status(404).json({ status: false, msg: 'Customer not found' });
  }
};

/**
 * @Route GET /api/admin/customers/subscribers/list
 */
export const listAdminSubscribers = async (req: Request, res: Response): Promise<any> => {
  const validated = adminSubscriberListQuerySchema.validate(
    {
      search: req.query.search,
      filter: req.query.filter,
      join_date_from: req.query.join_date_from,
      join_date_to: req.query.join_date_to,
      show_limit: req.query.show_limit ? Number(req.query.show_limit) : undefined,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 25,
    },
    { stripUnknown: true }
  );
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    const result = await listSubscribersAdmin(validated.value);
    return res.status(200).json({ status: true, msg: 'Success', data: result });
  } catch (e) {
    console.error('[admin/customers/subscribers]', e);
    return res.status(500).json({ status: false, msg: 'Failed to load subscribers' });
  }
};

/**
 * @Route POST /api/admin/customers/wallet/add-fund
 */
export const adminAddWalletFund = async (req: Request, res: Response): Promise<any> => {
  const validated = adminAddFundSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  const { customer_id, amount, referance } = validated.value;
  try {
    const row = await createWalletTransaction(prisma, {
      userId: customer_id,
      amount,
      transactionType: 'add_fund_by_admin',
      reference: referance ?? null,
      skipStatusCheck: true,
    });
    if (!row) {
      return res.status(400).json({ status: false, msg: 'Failed to create transaction' });
    }
    return res.status(200).json({ status: true, data: { id: row.id.toString() } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to add fund';
    return res.status(400).json({ status: false, msg });
  }
};

/**
 * @Route GET /api/admin/customers/wallet/report
 */
export const adminWalletReport = async (req: Request, res: Response): Promise<any> => {
  const validated = adminWalletReportQuerySchema.validate(
    {
      from: req.query.from,
      to: req.query.to,
      transaction_type: req.query.transaction_type,
      customer_id: req.query.customer_id ? Number(req.query.customer_id) : undefined,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 25,
    },
    { stripUnknown: true }
  );
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    const result = await walletReportAdmin(validated.value);
    return res.status(200).json({ status: true, msg: 'Success', data: result });
  } catch (e) {
    console.error('[admin/customers/wallet/report]', e);
    return res.status(500).json({ status: false, msg: 'Failed to load wallet report' });
  }
};

/**
 * @Route GET /api/admin/customers/loyalty/report
 */
export const adminLoyaltyReport = async (req: Request, res: Response): Promise<any> => {
  const validated = adminWalletReportQuerySchema.validate(
    {
      from: req.query.from,
      to: req.query.to,
      transaction_type: req.query.transaction_type,
      customer_id: req.query.customer_id ? Number(req.query.customer_id) : undefined,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 25,
    },
    { stripUnknown: true }
  );
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    const result = await loyaltyReportAdmin({
      ...validated.value,
      search: req.query.search ? String(req.query.search) : undefined,
    });
    return res.status(200).json({ status: true, msg: 'Success', data: result });
  } catch (e) {
    console.error('[admin/customers/loyalty/report]', e);
    return res.status(500).json({ status: false, msg: 'Failed to load loyalty report' });
  }
};

/**
 * @Route GET /api/admin/customers/wallet/bonuses
 */
export const listAdminWalletBonuses = async (_req: Request, res: Response): Promise<any> => {
  try {
    const rows = await prisma.wallet_bonuses.findMany({
      orderBy: { created_at: 'desc' },
    });
    return res.status(200).json({
      status: true,
      msg: 'Success',
      data: {
        data: rows.map((b) => ({
          id: Number(b.id),
          title: b.title,
          description: b.description,
          bonus_type: b.bonus_type,
          bonus_amount: b.bonus_amount,
          minimum_add_amount: b.minimum_add_amount,
          maximum_bonus_amount: b.maximum_bonus_amount,
          start_date: b.start_date,
          end_date: b.end_date,
          status: b.status,
          created_at: b.created_at,
        })),
      },
    });
  } catch (e) {
    console.error('[admin/customers/wallet/bonuses]', e);
    return res.status(500).json({ status: false, msg: 'Failed to load wallet bonuses' });
  }
};

/**
 * @Route POST /api/admin/customers/wallet/bonuses
 */
export const createAdminWalletBonus = async (req: Request, res: Response): Promise<any> => {
  const validated = adminWalletBonusCreateSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  const v = validated.value;
  if (v.bonus_type === 'percentage' && v.maximum_bonus_amount == null) {
    return res.status(400).json({
      status: false,
      msg: '"maximum_bonus_amount" is required when bonus_type is percentage',
    });
  }
  const now = new Date();
  try {
    const bonus = await prisma.wallet_bonuses.create({
      data: {
        title: v.title,
        description: v.description ?? null,
        bonus_type: v.bonus_type,
        bonus_amount: v.bonus_amount,
        minimum_add_amount: v.minimum_add_amount,
        maximum_bonus_amount: v.maximum_bonus_amount ?? 0,
        start_date: new Date(v.start_date),
        end_date: new Date(v.end_date),
        status: true,
        created_at: now,
        updated_at: now,
      },
    });
    const translations = (v.translations ?? {}) as Record<
      string,
      { title?: string; description?: string }
    >;
    const transRows = Object.entries(translations).flatMap(([locale, fields]) => {
      const out: {
        translationable_type: string;
        translationable_id: number;
        locale: string;
        key: string;
        value: string;
        created_at: Date;
        updated_at: Date;
      }[] = [];
      if (fields.title) {
        out.push({
          translationable_type: WALLET_BONUS_TYPE,
          translationable_id: Number(bonus.id),
          locale,
          key: 'title',
          value: fields.title,
          created_at: now,
          updated_at: now,
        });
      }
      if (fields.description) {
        out.push({
          translationable_type: WALLET_BONUS_TYPE,
          translationable_id: Number(bonus.id),
          locale,
          key: 'description',
          value: fields.description,
          created_at: now,
          updated_at: now,
        });
      }
      return out;
    });
    if (transRows.length) {
      await prisma.translations.createMany({ data: transRows });
    }
    return res.status(201).json({ status: true, data: { id: Number(bonus.id) } });
  } catch (e) {
    console.error('[admin/customers/wallet/bonuses create]', e);
    return res.status(500).json({ status: false, msg: 'Failed to create bonus' });
  }
};

/**
 * @Route PATCH /api/admin/customers/wallet/bonuses/:id/status
 */
export const updateAdminWalletBonusStatus = async (req: Request, res: Response): Promise<any> => {
  const id = Number(req.params.id);
  const schema = Joi.object({ status: Joi.boolean().required() });
  const validated = schema.validate(req.body);
  if (!id || Number.isNaN(id)) {
    return res.status(400).json({ status: false, msg: 'Invalid bonus id' });
  }
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    const row = await prisma.wallet_bonuses.update({
      where: { id: BigInt(id) },
      data: { status: validated.value.status, updated_at: new Date() },
    });
    return res.status(200).json({ status: true, data: { id: Number(row.id), status: row.status } });
  } catch {
    return res.status(404).json({ status: false, msg: 'Bonus not found' });
  }
};

/**
 * @Route DELETE /api/admin/customers/wallet/bonuses/:id
 */
export const deleteAdminWalletBonus = async (req: Request, res: Response): Promise<any> => {
  const id = Number(req.params.id);
  if (!id || Number.isNaN(id)) {
    return res.status(400).json({ status: false, msg: 'Invalid bonus id' });
  }
  try {
    await prisma.wallet_bonuses.delete({ where: { id: BigInt(id) } });
    await prisma.translations.deleteMany({
      where: {
        translationable_type: WALLET_BONUS_TYPE,
        translationable_id: id,
      },
    });
    return res.status(200).json({ status: true });
  } catch {
    return res.status(404).json({ status: false, msg: 'Bonus not found' });
  }
};
