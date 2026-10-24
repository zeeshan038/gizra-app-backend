import prisma from '../../../config/database';
import { RESTAURANT_TRANSLATION_TYPE } from '../../../types/vendor/restaurantSetup';
import { publicRestaurantMediaUrl } from '../../mediaStorage';

function parseDeliveryTime(deliveryTime: string | null | undefined) {
  if (!deliveryTime) return null;
  const match = deliveryTime.match(/^(\d+)-(\d+)-(min|hours)$/);
  if (!match) return null;
  return {
    minimum_delivery_time: Number(match[1]),
    maximum_delivery_time: Number(match[2]),
    delivery_time_type: match[3] as 'min' | 'hours',
  };
}

export async function getAdminRestaurantDetail(restaurantId: number) {
  const restaurant = await prisma.restaurants.findUnique({
    where: { id: BigInt(restaurantId) },
  });
  if (!restaurant) {
    return null;
  }

  const vendor = await prisma.vendors.findUnique({
    where: { id: BigInt(Number(restaurant.vendor_id)) },
    select: {
      id: true,
      f_name: true,
      l_name: true,
      email: true,
      phone: true,
      status: true,
    },
  });

  const [zone, cuisineLinks, tagLinks, translations, wallet, reviewAgg, orderCount, foodCount] =
    await Promise.all([
      restaurant.zone_id != null
        ? prisma.zones.findUnique({
            where: { id: BigInt(Number(restaurant.zone_id)) },
            select: { id: true, name: true },
          })
        : null,
      prisma.cuisine_restaurant.findMany({
        where: { restaurant_id: restaurantId },
        select: { cuisine_id: true },
      }),
      prisma.restaurant_tag.findMany({
        where: { restaurant_id: restaurantId },
        select: { tag_id: true },
      }),
      prisma.translations.findMany({
        where: {
          translationable_type: RESTAURANT_TRANSLATION_TYPE,
          translationable_id: restaurantId,
          key: { in: ['name', 'address'] },
        },
        select: { locale: true, key: true, value: true },
      }),
      vendor
        ? prisma.restaurant_wallets.findFirst({
            where: { vendor_id: Number(vendor.id) },
          })
        : null,
      prisma.reviews.aggregate({
        where: {
          restaurant_id: restaurantId,
          OR: [{ status: true }, { status: null }],
        },
        _avg: { rating: true },
        _count: true,
      }),
      prisma.orders.count({ where: { restaurant_id: restaurantId } }),
      prisma.food.count({ where: { restaurant_id: restaurantId } }),
    ]);

  const cuisineIds = cuisineLinks.map((c) => Number(c.cuisine_id));
  const cuisines =
    cuisineIds.length > 0
      ? await prisma.cuisines.findMany({
          where: { id: { in: cuisineIds.map((id) => BigInt(id)) } },
          select: { id: true, name: true },
        })
      : [];

  const tagIds = tagLinks.map((t) => Number(t.tag_id));
  const tags =
    tagIds.length > 0
      ? await prisma.tags.findMany({
          where: { id: { in: tagIds.map((id) => BigInt(id)) } },
          select: { tag: true },
        })
      : [];

  const names = {
    default: restaurant.name,
    en: '',
    he: '',
  };
  const addresses = {
    default: restaurant.address ?? '',
    en: '',
    he: '',
  };
  for (const row of translations) {
    if (row.locale === 'en' || row.locale === 'he') {
      const val = row.value ?? '';
      if (row.key === 'name') names[row.locale] = val;
      if (row.key === 'address') addresses[row.locale] = val;
    }
  }

  const totalEarning = Number(wallet?.total_earning ?? 0);
  const totalWithdrawn = Number(wallet?.total_withdrawn ?? 0);
  const pendingWithdraw = Number(wallet?.pending_withdraw ?? 0);
  const collectedCash = Number(wallet?.collected_cash ?? 0);
  const balance = totalEarning - totalWithdrawn - pendingWithdraw;

  return {
    id: restaurantId,
    name: restaurant.name,
    phone: restaurant.phone,
    email: restaurant.email,
    address: restaurant.address,
    latitude: restaurant.latitude,
    longitude: restaurant.longitude,
    zone_id: restaurant.zone_id != null ? Number(restaurant.zone_id) : null,
    zone_name: zone?.name ?? null,
    tax: Number(restaurant.tax ?? 0),
    status: restaurant.status,
    active: restaurant.active,
    restaurant_model: restaurant.restaurant_model,
    logo: publicRestaurantMediaUrl(restaurant.logo, 'logo'),
    cover_photo: publicRestaurantMediaUrl(restaurant.cover_photo, 'cover'),
    delivery: parseDeliveryTime(restaurant.delivery_time),
    names,
    addresses,
    cuisine_ids: cuisineIds,
    cuisines: cuisines.map((c) => ({ id: Number(c.id), name: c.name })),
    tags: tags.map((t) => t.tag),
    vendor: vendor
      ? {
          id: Number(vendor.id),
          f_name: vendor.f_name,
          l_name: vendor.l_name,
          email: vendor.email,
          phone: vendor.phone,
          status: vendor.status,
        }
      : null,
    wallet: {
      total_earning: totalEarning,
      total_withdrawn: totalWithdrawn,
      pending_withdraw: pendingWithdraw,
      collected_cash: collectedCash,
      balance,
    },
    rating: reviewAgg._count
      ? Math.round(Number(reviewAgg._avg.rating ?? 0) * 10) / 10
      : 0,
    reviews_count: reviewAgg._count,
    orders_count: orderCount,
    foods_count: foodCount,
    created_at: restaurant.created_at,
  };
}
