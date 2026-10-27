import { Request, Response } from 'express';
import Joi from 'joi';
import prisma from '../../config/database';
import {
  adminBasicCampaignCreateSchema,
  adminCampaignListQuerySchema,
  adminFoodCampaignCreateSchema,
} from '../../schemas/admin/Campaign';
import { listBasicCampaignsAdmin, listFoodCampaignsAdmin } from '../../utils/admin/campaigns/listCampaignsAdmin';
import { parseTimeToDb } from '../../utils/admin/campaigns/formatCampaignAdmin';

const CAMPAIGN_TYPE = 'App\\Models\\Campaign';
const ITEM_CAMPAIGN_TYPE = 'App\\Models\\ItemCampaign';

function categoryIdsPayload(body: {
  category_id: number;
  sub_category_id?: number;
  sub_sub_category_id?: number;
}) {
  const category: { id: number; position: number }[] = [
    { id: body.category_id, position: 1 },
  ];
  if (body.sub_category_id) category.push({ id: body.sub_category_id, position: 2 });
  if (body.sub_sub_category_id) category.push({ id: body.sub_sub_category_id, position: 3 });
  return JSON.stringify(category);
}

/**
 * @Route GET /api/admin/campaigns/list
 */
export const listAdminCampaigns = async (req: Request, res: Response): Promise<any> => {
  const validated = adminCampaignListQuerySchema.validate(
    {
      type: req.query.type,
      search: req.query.search,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 25,
    },
    { stripUnknown: true }
  );
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    const result =
      validated.value.type === 'food'
        ? await listFoodCampaignsAdmin(validated.value)
        : await listBasicCampaignsAdmin(validated.value);
    return res.status(200).json({ status: true, msg: 'Success', data: result });
  } catch (e) {
    console.error('[admin/campaigns/list]', e);
    return res.status(500).json({ status: false, msg: 'Failed to load campaigns' });
  }
};

/**
 * @Route POST /api/admin/campaigns/basic
 */
export const createAdminBasicCampaign = async (req: Request, res: Response): Promise<any> => {
  const validated = adminBasicCampaignCreateSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  const v = validated.value;
  const adminId = req.user?.id ? Number(req.user.id) : null;
  const now = new Date();
  try {
    const existing = await prisma.campaigns.findFirst({
      where: { title: v.title },
      select: { id: true },
    });
    if (existing) {
      return res.status(400).json({ status: false, msg: 'Title already exists' });
    }
    const row = await prisma.campaigns.create({
      data: {
        title: v.title,
        description: v.description ?? null,
        image: v.image,
        start_date: new Date(`${v.start_date}T00:00:00.000Z`),
        end_date: new Date(`${v.end_date}T00:00:00.000Z`),
        start_time: parseTimeToDb(v.start_time),
        end_time: parseTimeToDb(v.end_time),
        status: true,
        admin_id: adminId,
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
          translationable_type: CAMPAIGN_TYPE,
          translationable_id: Number(row.id),
          locale,
          key: 'title',
          value: fields.title,
          created_at: now,
          updated_at: now,
        });
      }
      if (fields.description) {
        out.push({
          translationable_type: CAMPAIGN_TYPE,
          translationable_id: Number(row.id),
          locale,
          key: 'description',
          value: fields.description,
          created_at: now,
          updated_at: now,
        });
      }
      return out;
    });
    if (transRows.length) await prisma.translations.createMany({ data: transRows });
    return res.status(201).json({ status: true, data: { id: Number(row.id) } });
  } catch (e) {
    console.error('[admin/campaigns/basic create]', e);
    return res.status(500).json({ status: false, msg: 'Failed to create campaign' });
  }
};

/**
 * @Route POST /api/admin/campaigns/food
 */
export const createAdminFoodCampaign = async (req: Request, res: Response): Promise<any> => {
  const validated = adminFoodCampaignCreateSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  const v = validated.value;
  const discount =
    v.discount_type === 'percent' ? (v.price * v.discount) / 100 : v.discount;
  if (v.price <= discount) {
    return res.status(400).json({
      status: false,
      msg: 'Discount cannot be greater than or equal to price',
    });
  }
  const adminId = req.user?.id ? Number(req.user.id) : 0;
  const now = new Date();
  try {
    const row = await prisma.item_campaigns.create({
      data: {
        title: v.title,
        description: v.description ?? null,
        image: v.image,
        restaurant_id: v.restaurant_id,
        category_id: v.category_id,
        category_ids: categoryIdsPayload(v),
        price: v.price,
        discount: v.discount,
        discount_type: v.discount_type,
        tax: v.tax,
        tax_type: v.tax_type,
        veg: v.veg,
        start_date: new Date(`${v.start_date}T00:00:00.000Z`),
        end_date: new Date(`${v.end_date}T00:00:00.000Z`),
        start_time: parseTimeToDb(v.start_time),
        end_time: parseTimeToDb(v.end_time),
        status: true,
        admin_id: adminId,
        created_at: now,
        updated_at: now,
      },
    });
    return res.status(201).json({ status: true, data: { id: Number(row.id) } });
  } catch (e) {
    console.error('[admin/campaigns/food create]', e);
    return res.status(500).json({ status: false, msg: 'Failed to create food campaign' });
  }
};

/**
 * @Route PATCH /api/admin/campaigns/:type/:id/status
 */
export const updateAdminCampaignStatus = async (req: Request, res: Response): Promise<any> => {
  const type = req.params.type;
  const id = Number(req.params.id);
  const schema = Joi.object({ status: Joi.boolean().required() });
  const validated = schema.validate(req.body);
  if (!id || Number.isNaN(id)) {
    return res.status(400).json({ status: false, msg: 'Invalid id' });
  }
  if (type !== 'basic' && type !== 'food') {
    return res.status(400).json({ status: false, msg: 'Invalid campaign type' });
  }
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    if (type === 'food') {
      await prisma.item_campaigns.update({
        where: { id: BigInt(id) },
        data: { status: validated.value.status, updated_at: new Date() },
      });
    } else {
      await prisma.campaigns.update({
        where: { id: BigInt(id) },
        data: { status: validated.value.status, updated_at: new Date() },
      });
    }
    return res.status(200).json({ status: true, data: { id, status: validated.value.status } });
  } catch {
    return res.status(404).json({ status: false, msg: 'Campaign not found' });
  }
};

/**
 * @Route DELETE /api/admin/campaigns/:type/:id
 */
export const deleteAdminCampaign = async (req: Request, res: Response): Promise<any> => {
  const type = req.params.type;
  const id = Number(req.params.id);
  if (!id || Number.isNaN(id)) {
    return res.status(400).json({ status: false, msg: 'Invalid id' });
  }
  if (type !== 'basic' && type !== 'food') {
    return res.status(400).json({ status: false, msg: 'Invalid campaign type' });
  }
  try {
    if (type === 'food') {
      await prisma.item_campaigns.delete({ where: { id: BigInt(id) } });
      await prisma.translations.deleteMany({
        where: { translationable_type: ITEM_CAMPAIGN_TYPE, translationable_id: id },
      });
    } else {
      await prisma.campaigns.delete({ where: { id: BigInt(id) } });
      await prisma.translations.deleteMany({
        where: { translationable_type: CAMPAIGN_TYPE, translationable_id: id },
      });
    }
    return res.status(200).json({ status: true });
  } catch {
    return res.status(404).json({ status: false, msg: 'Campaign not found' });
  }
};
