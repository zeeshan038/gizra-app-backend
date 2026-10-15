import { Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import prisma from '../../../config/database';

export const BULK_EXPORT_COLUMNS = [
  'id',
  'ownerID',
  'ownerFirstName',
  'ownerLastName',
  'restaurantName',
  'CoverPhoto',
  'logo',
  'phone',
  'email',
  'latitude',
  'longitude',
  'zone_id',
  'Address',
  'Slug',
  'MinimumOrderAmount',
  'Comission',
  'Tax',
  'DeliveryTime',
  'MinimumDeliveryFee',
  'PerKmDeliveryFee',
  'MaximumDeliveryFee',
  'RestaurantModel',
  'ScheduleOrder',
  'FreeDelivery',
  'TakeAway',
  'Delivery',
  'Veg',
  'NonVeg',
  'OrderSubscription',
  'Status',
  'FoodSection',
  'ReviewsSection',
  'SelfDeliverySystem',
  'PosSystem',
  'RestaurantOpen',
] as const;

function yesNo(flag: boolean) {
  return flag ? 'yes' : 'no';
}

function activeInactive(flag: boolean) {
  return flag ? 'active' : 'inactive';
}

export function formatRestaurantExportRow(
  vendor: {
    id: bigint;
    f_name: string;
    l_name: string | null;
    email: string;
    phone: string;
  },
  restaurant: Awaited<ReturnType<typeof prisma.restaurants.findFirst>>
) {
  if (!restaurant) return null;
  return {
    id: Number(restaurant.id),
    ownerID: Number(vendor.id),
    ownerFirstName: vendor.f_name,
    ownerLastName: vendor.l_name ?? '',
    restaurantName: restaurant.name,
    CoverPhoto: restaurant.cover_photo ?? '',
    logo: restaurant.logo ?? '',
    phone: vendor.phone,
    email: vendor.email,
    latitude: restaurant.latitude ?? '',
    longitude: restaurant.longitude ?? '',
    zone_id: restaurant.zone_id != null ? Number(restaurant.zone_id) : '',
    Address: restaurant.address ?? '',
    Slug: restaurant.slug ?? '',
    MinimumOrderAmount: Number(restaurant.minimum_order),
    Comission: restaurant.comission != null ? Number(restaurant.comission) : 0,
    Tax: Number(restaurant.tax),
    DeliveryTime: restaurant.delivery_time ?? '20-30',
    MinimumDeliveryFee: Number(restaurant.minimum_shipping_charge ?? 0),
    PerKmDeliveryFee: Number(restaurant.per_km_shipping_charge ?? 0),
    MaximumDeliveryFee: Number(restaurant.maximum_shipping_charge ?? 0),
    RestaurantModel: restaurant.restaurant_model ?? 'commission',
    ScheduleOrder: yesNo(restaurant.schedule_order),
    FreeDelivery: yesNo(restaurant.free_delivery),
    TakeAway: yesNo(restaurant.take_away),
    Delivery: yesNo(restaurant.delivery),
    Veg: yesNo(restaurant.veg),
    NonVeg: yesNo(restaurant.non_veg),
    OrderSubscription: yesNo(restaurant.order_subscription_active ?? false),
    Status: restaurant.status ? 'active' : 'inactive',
    FoodSection: activeInactive(restaurant.food_section),
    ReviewsSection: activeInactive(restaurant.reviews_section),
    SelfDeliverySystem: activeInactive(restaurant.self_delivery_system),
    PosSystem: activeInactive(restaurant.pos_system),
    RestaurantOpen: yesNo(restaurant.active),
  };
}

export async function buildBulkExportRows(params: {
  type: 'all' | 'date_wise' | 'id_wise';
  start_id?: number;
  end_id?: number;
  from_date?: string;
  to_date?: string;
}) {
  const vendorWhere: Prisma.vendorsWhereInput = {};

  if (params.type === 'all') {
    vendorWhere.status = true;
  } else if (params.type === 'date_wise' && params.from_date && params.to_date) {
    vendorWhere.created_at = {
      gte: new Date(`${params.from_date}T00:00:00.000Z`),
      lte: new Date(`${params.to_date}T23:59:59.999Z`),
    };
  } else if (params.type === 'id_wise' && params.start_id != null && params.end_id != null) {
    vendorWhere.id = { gte: BigInt(params.start_id), lte: BigInt(params.end_id) };
  }

  const vendors = await prisma.vendors.findMany({
    where: vendorWhere,
    orderBy: { id: 'asc' },
  });

  const rows: Record<string, string | number>[] = [];
  for (const vendor of vendors) {
    const restaurant = await prisma.restaurants.findFirst({
      where: { vendor_id: Number(vendor.id) },
      orderBy: { id: 'asc' },
    });
    const formatted = formatRestaurantExportRow(vendor, restaurant);
    if (formatted) rows.push(formatted);
  }
  return rows;
}

export function rowsToXlsxBuffer(rows: Record<string, string | number>[]) {
  const sheet = XLSX.utils.json_to_sheet(rows, { header: [...BULK_EXPORT_COLUMNS] });
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Restaurants');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
