import bcrypt from 'bcrypt';
import * as XLSX from 'xlsx';
import prisma from '../../../config/database';
import { provisionAccountStorage } from '../../accountStorage';
import { normalizeStoredMedia } from '../../mediaStorage';

const REQUIRED_IMPORT_FIELDS = [
  'ownerFirstName',
  'restaurantName',
  'phone',
  'Comission',
  'Tax',
  'email',
  'latitude',
  'longitude',
  'zone_id',
  'DeliveryTime',
  'RestaurantModel',
] as const;

function parseYesNo(val: unknown, defaultYes = false) {
  if (val == null || val === '') return defaultYes;
  const s = String(val).toLowerCase();
  return s === 'yes' || s === '1' || s === 'true' || s === 'active';
}

function parseActiveInactive(val: unknown, defaultActive = true) {
  if (val == null || val === '') return defaultActive;
  const s = String(val).toLowerCase();
  return s === 'active' || s === 'yes' || s === '1' || s === 'true';
}

export function parseImportWorkbook(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('Empty Excel file');
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
    defval: '',
  });
}

function validateImportRow(row: Record<string, unknown>, rowIndex: number) {
  for (const field of REQUIRED_IMPORT_FIELDS) {
    if (row[field] === '' || row[field] == null) {
      throw new Error(`Row ${rowIndex + 2}: missing required field "${field}"`);
    }
  }

  const delivery = String(row.DeliveryTime);
  const parts = delivery.split('-');
  if (parts.length >= 2 && Number(parts[0]) > Number(parts[1])) {
    throw new Error(`Row ${rowIndex + 2}: max delivery time must be greater than min`);
  }

  const commission = Number(row.Comission);
  if (commission < 0 || commission > 100) {
    throw new Error(`Row ${rowIndex + 2}: Comission must be between 0 and 100`);
  }

  const tax = Number(row.Tax);
  if (tax < 0 || tax > 100) {
    throw new Error(`Row ${rowIndex + 2}: Tax must be between 0 and 100`);
  }

  const lat = Number(row.latitude);
  const lng = Number(row.longitude);
  if (lat < -90 || lat > 90) throw new Error(`Row ${rowIndex + 2}: invalid latitude`);
  if (lng < -180 || lng > 180) throw new Error(`Row ${rowIndex + 2}: invalid longitude`);
}

export async function bulkImportRestaurantsFromRows(
  rows: Record<string, unknown>[],
  mode: 'import' | 'update'
) {
  if (!rows.length) throw new Error('No rows in file');

  const emails = rows.map((r) => String(r.email).trim());
  const phones = rows.map((r) => String(r.phone).trim());
  if (new Set(emails).size !== emails.length) throw new Error('Duplicate email in file');
  if (new Set(phones).size !== phones.length) throw new Error('Duplicate phone in file');

  rows.forEach((row, i) => validateImportRow(row, i));

  if (mode === 'import') {
    const exists = await prisma.restaurants.findFirst({
      where: { OR: [{ email: { in: emails } }, { phone: { in: phones } }] },
    });
    if (exists) throw new Error('Duplicate email or phone already exists in database');
  } else {
    const missing = await prisma.restaurants.count({
      where: { OR: [{ email: { in: emails } }, { phone: { in: phones } }] },
    });
    if (missing === 0) throw new Error('No matching email or phone in database for update');
  }

  const defaultPassword = await bcrypt.hash('12345678', 10);
  const now = new Date();
  let imported = 0;

  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      const email = String(row.email).trim();
      const phone = String(row.phone).trim();

      if (mode === 'update') {
        const existing = await tx.restaurants.findFirst({
          where: { OR: [{ email }, { phone }] },
        });
        if (!existing) continue;

        await tx.restaurants.update({
          where: { id: existing.id },
          data: {
            name: String(row.restaurantName),
            address: row.Address != null ? String(row.Address) : existing.address,
            latitude: String(row.latitude),
            longitude: String(row.longitude),
            zone_id: Number(row.zone_id),
            tax: Number(row.Tax),
            minimum_order: Number(row.MinimumOrderAmount ?? existing.minimum_order),
            delivery_time: String(row.DeliveryTime),
            comission: Number(row.Comission),
            minimum_shipping_charge: Number(row.MinimumDeliveryFee ?? 0),
            per_km_shipping_charge: Number(row.PerKmDeliveryFee ?? 0),
            maximum_shipping_charge: Number(row.MaximumDeliveryFee ?? 0),
            restaurant_model:
              String(row.RestaurantModel) === 'subscription' ? 'unsubscribed' : String(row.RestaurantModel || 'commission'),
            schedule_order: parseYesNo(row.ScheduleOrder),
            take_away: parseYesNo(row.TakeAway, true),
            free_delivery: parseYesNo(row.FreeDelivery),
            veg: parseYesNo(row.Veg, true),
            non_veg: parseYesNo(row.NonVeg, true),
            order_subscription_active: parseYesNo(row.OrderSubscription),
            delivery: parseYesNo(row.Delivery, true),
            status: !row.Status || String(row.Status).toLowerCase() === 'active',
            food_section: parseActiveInactive(row.FoodSection),
            reviews_section: parseActiveInactive(row.ReviewsSection),
            pos_system: parseActiveInactive(row.PosSystem, false),
            self_delivery_system: parseActiveInactive(row.SelfDeliverySystem, false),
            active: parseYesNo(row.RestaurantOpen, true),
            logo: normalizeStoredMedia(String(row.logo ?? ''), existing.logo ?? 'default_logo.png'),
            cover_photo: normalizeStoredMedia(
              String(row.CoverPhoto ?? ''),
              existing.cover_photo ?? 'default_cover.png'
            ),
            updated_at: now,
          },
        });

        await tx.vendors.updateMany({
          where: { id: BigInt(Number(existing.vendor_id)) },
          data: {
            f_name: String(row.ownerFirstName),
            l_name: row.ownerLastName != null ? String(row.ownerLastName) : null,
            updated_at: now,
          },
        });
        imported += 1;
        continue;
      }

      const cloudflareId = await provisionAccountStorage('vendor', undefined);
      const vendor = await tx.vendors.create({
        data: {
          f_name: String(row.ownerFirstName),
          l_name: row.ownerLastName != null ? String(row.ownerLastName) : null,
          email,
          phone,
          password: defaultPassword,
          cloudflareId,
          status: true,
          created_at: now,
          updated_at: now,
        },
      });

      const restaurant = await tx.restaurants.create({
        data: {
          name: String(row.restaurantName),
          logo: normalizeStoredMedia(String(row.logo ?? ''), 'default_logo.png'),
          cover_photo: normalizeStoredMedia(String(row.CoverPhoto ?? ''), 'default_cover.png'),
          phone,
          email,
          latitude: String(row.latitude),
          longitude: String(row.longitude),
          vendor_id: Number(vendor.id),
          zone_id: Number(row.zone_id),
          address: row.Address != null ? String(row.Address) : null,
          tax: Number(row.Tax),
          minimum_order: Number(row.MinimumOrderAmount ?? 0),
          delivery_time: String(row.DeliveryTime),
          comission: Number(row.Comission),
          minimum_shipping_charge: Number(row.MinimumDeliveryFee ?? 0),
          per_km_shipping_charge: Number(row.PerKmDeliveryFee ?? 0),
          maximum_shipping_charge: Number(row.MaximumDeliveryFee ?? 0),
          restaurant_model:
            String(row.RestaurantModel) === 'subscription' ? 'unsubscribed' : String(row.RestaurantModel || 'commission'),
          schedule_order: parseYesNo(row.ScheduleOrder),
          take_away: parseYesNo(row.TakeAway, true),
          free_delivery: parseYesNo(row.FreeDelivery),
          veg: parseYesNo(row.Veg, true),
          non_veg: parseYesNo(row.NonVeg, true),
          order_subscription_active: parseYesNo(row.OrderSubscription),
          delivery: parseYesNo(row.Delivery, true),
          status: String(row.Status).toLowerCase() === 'active',
          food_section: parseActiveInactive(row.FoodSection),
          reviews_section: parseActiveInactive(row.ReviewsSection),
          pos_system: parseActiveInactive(row.PosSystem, false),
          self_delivery_system: parseActiveInactive(row.SelfDeliverySystem, false),
          active: parseYesNo(row.RestaurantOpen, true),
          created_at: now,
          updated_at: now,
        },
      });

      const rid = Number(restaurant.id);
      for (const day of [0, 1, 2, 3, 4, 5, 6]) {
        await tx.restaurant_schedule.create({
          data: {
            restaurant_id: rid,
            day,
            opening_time: new Date('1970-01-01T00:00:00.000Z'),
            closing_time: new Date('1970-01-01T23:59:59.000Z'),
            created_at: now,
            updated_at: now,
          },
        });
      }

      imported += 1;
    }
  }, { maxWait: 30000, timeout: 120000 });

  return { imported };
}
