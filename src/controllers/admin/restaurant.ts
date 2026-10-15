import { Request, Response } from 'express';
import prisma from '../../config/database';
import {
  adminCreateRestaurantSchema,
  adminRestaurantBulkExportSchema,
  adminRestaurantJoinQuerySchema,
  adminRestaurantListQuerySchema,
} from '../../schemas/admin/Restaurant';
import { createAdminRestaurant } from '../../utils/admin/restaurants/createAdminRestaurant';
import {
  bulkImportRestaurantsFromRows,
  parseImportWorkbook,
} from '../../utils/admin/restaurants/bulkImportRestaurants';
import {
  buildBulkExportRows,
  rowsToXlsxBuffer,
} from '../../utils/admin/restaurants/bulkExportRestaurants';
import { listRestaurantsAdmin } from '../../utils/admin/restaurants/listRestaurantsAdmin';

function parseListQuery(req: Request) {
  const raw = {
    search: req.query.search,
    zone_id: req.query.zone_id === 'all' ? 'all' : Number(req.query.zone_id),
    cuisine_id: req.query.cuisine_id === 'all' ? 'all' : Number(req.query.cuisine_id),
    type: req.query.type ?? 'all',
    restaurant_model: req.query.restaurant_model ?? 'all',
    active_only: req.query.active_only ?? '1',
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 15,
  };
  if (Number.isNaN(raw.zone_id as number)) raw.zone_id = 'all';
  if (Number.isNaN(raw.cuisine_id as number)) raw.cuisine_id = 'all';
  return raw;
}

/**
 * @Route GET /api/admin/restaurants/list
 */
export const listAdminRestaurants = async (req: Request, res: Response): Promise<any> => {
  const validated = adminRestaurantListQuerySchema.validate(parseListQuery(req), {
    stripUnknown: true,
  });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    const result = await listRestaurantsAdmin({
      ...validated.value,
      vendorApprovedOnly: true,
    });
    return res.status(200).json({ status: true, msg: 'Success', data: result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'List failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Route GET /api/admin/restaurants/join-requests
 */
export const listAdminRestaurantJoinRequests = async (req: Request, res: Response): Promise<any> => {
  const parsed = parseListQuery(req);
  const validated = adminRestaurantJoinQuerySchema.validate(
    {
      tab: req.query.tab ?? 'pending',
      search: parsed.search,
      zone_id: parsed.zone_id,
      type: parsed.type,
      restaurant_model: parsed.restaurant_model,
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
    const result = await listRestaurantsAdmin({
      search: validated.value.search,
      zone_id: validated.value.zone_id,
      type: validated.value.type,
      restaurant_model: validated.value.restaurant_model,
      active_only: '0',
      page: validated.value.page,
      limit: validated.value.limit,
      vendorPendingOnly: tab === 'pending',
      vendorDeniedOnly: tab === 'denied',
    });
    return res.status(200).json({ status: true, msg: 'Success', data: result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'List failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Route GET /api/admin/restaurants/cuisines
 */
export const listAdminRestaurantCuisines = async (_req: Request, res: Response): Promise<any> => {
  try {
    const cuisines = await prisma.cuisines.findMany({
      where: { status: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    return res.status(200).json({
      status: true,
      msg: 'Success',
      data: cuisines.map((c) => ({ id: Number(c.id), name: c.name })),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Route POST /api/admin/restaurants/create
 */
export const createAdminRestaurantHandler = async (req: Request, res: Response): Promise<any> => {
  const validated = adminCreateRestaurantSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    const data = await createAdminRestaurant(validated.value);
    return res.status(201).json({
      status: true,
      msg: 'Restaurant added successfully',
      data,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Create failed';
    return res.status(400).json({ status: false, msg });
  }
};

/**
 * @Route POST /api/admin/restaurants/bulk-import
 */
export const bulkImportAdminRestaurants = async (req: Request, res: Response): Promise<any> => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ status: false, msg: 'upload_excel file is required' });
  }
  const uploadType = String(req.body.upload_type ?? 'import') as 'import' | 'update';
  if (uploadType !== 'import' && uploadType !== 'update') {
    return res.status(400).json({ status: false, msg: 'Invalid upload_type' });
  }
  try {
    const rows = parseImportWorkbook(file.buffer);
    const result = await bulkImportRestaurantsFromRows(rows, uploadType);
    return res.status(200).json({
      status: true,
      msg: `Imported ${result.imported} restaurant(s) successfully`,
      data: result,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Import failed';
    return res.status(400).json({ status: false, msg });
  }
};

/**
 * @Route POST /api/admin/restaurants/bulk-export
 */
export const bulkExportAdminRestaurants = async (req: Request, res: Response): Promise<any> => {
  const validated = adminRestaurantBulkExportSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    const rows = await buildBulkExportRows(validated.value);
    const buffer = rowsToXlsxBuffer(rows);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename="Restaurants.xlsx"');
    return res.send(buffer);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Export failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Route GET /api/admin/restaurants/bulk-import/template
 */
export const downloadBulkImportTemplate = async (req: Request, res: Response): Promise<any> => {
  const withData = String(req.query.with_data ?? '0') === '1';
  try {
    const rows = withData ? await buildBulkExportRows({ type: 'all' }) : [];
    const buffer = rowsToXlsxBuffer(rows);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${withData ? 'restaurants_bulk_format' : 'restaurants_bulk_format_nodata'}.xlsx"`
    );
    return res.send(buffer);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Template failed';
    return res.status(500).json({ status: false, msg });
  }
};
