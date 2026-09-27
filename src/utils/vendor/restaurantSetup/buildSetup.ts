import prisma from '../../../config/database';
import { getBusinessSetting, getBusinessSettingFlag } from '../../consumer/businessSettings';
import {
  RESTAURANT_TRANSLATION_TYPE,
  RestaurantSetupPayload,
} from '../../../types/vendor/restaurantSetup';
import {
  asNumber,
  businessSettingFlagOn,
  formatTime,
  metaImageUrl,
  parseJsonObject,
  parseLanguages,
} from './helpers';
import { readManualDispatch } from './manualDispatch';
import { selfDeliveryEnabled } from './loadRestaurant';

export async function buildRestaurantSetupPayload(
  restaurantId: bigint
): Promise<RestaurantSetupPayload | null> {
  const restaurant = await prisma.restaurants.findUnique({
    where: { id: restaurantId },
  });
  if (!restaurant) return null;

  const rid = Number(restaurant.id);
  const [
    config,
    cuisineLinks,
    tagLinks,
    characteristicLinks,
    translations,
    schedules,
    cuisines,
    characteristics,
    categories,
    languageRaw,
    toggleVegNonVeg,
    orderSubscription,
    extraPackagingCharge,
    dineInOrderOption,
    homeDelivery,
    takeAway,
    instantOrderSetting,
    scheduleOrderSetting,
    manualDispatch,
    selfDelivery,
  ] = await Promise.all([
    prisma.restaurant_configs.findFirst({ where: { restaurant_id: rid } }),
    prisma.cuisine_restaurant.findMany({ where: { restaurant_id: rid } }),
    prisma.restaurant_tag.findMany({ where: { restaurant_id: rid } }),
    prisma.characteristic_restaurant.findMany({ where: { restaurant_id: rid } }),
    prisma.translations.findMany({
      where: {
        translationable_type: RESTAURANT_TRANSLATION_TYPE,
        translationable_id: rid,
        key: { in: ['meta_title', 'meta_description'] },
      },
    }),
    prisma.restaurant_schedule.findMany({
      where: { restaurant_id: rid },
      orderBy: [{ day: 'asc' }, { opening_time: 'asc' }],
    }),
    prisma.cuisines.findMany({
      where: { status: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.characteristics.findMany({
      orderBy: { characteristic: 'asc' },
      select: { id: true, characteristic: true },
    }),
    prisma.categories.findMany({
      where: { status: true },
      select: { name: true },
      take: 400,
    }),
    getBusinessSetting('language'),
    getBusinessSettingFlag('toggle_veg_non_veg'),
    getBusinessSettingFlag('order_subscription'),
    getBusinessSettingFlag('extra_packaging_charge'),
    getBusinessSettingFlag('dine_in_order_option'),
    getBusinessSetting('home_delivery'),
    getBusinessSetting('take_away'),
    getBusinessSetting('instant_order'),
    getBusinessSetting('schedule_order'),
    readManualDispatch(restaurant.id),
    selfDeliveryEnabled(restaurant, rid),
  ]);

  const cuisineIds = cuisineLinks.map((row) => asNumber(row.cuisine_id));
  const tagIds = tagLinks.map((row) => asNumber(row.tag_id));
  const characteristicIds = characteristicLinks.map((row) => asNumber(row.characteristic_id));

  const [tags, selectedCharacteristics] = await Promise.all([
    tagIds.length
      ? prisma.tags.findMany({ where: { id: { in: tagIds.map((id) => BigInt(id)) } } })
      : Promise.resolve([]),
    characteristicIds.length
      ? prisma.characteristics.findMany({
          where: { id: { in: characteristicIds.map((id) => BigInt(id)) } },
        })
      : Promise.resolve([]),
  ]);

  const gst = parseJsonObject(restaurant.gst);
  const freeDistance = parseJsonObject(restaurant.free_delivery_distance);
  const translationMap: Record<string, { meta_title: string; meta_description: string }> = {};
  translations.forEach((row) => {
    if (!row.locale || !row.key) return;
    if (!translationMap[row.locale]) {
      translationMap[row.locale] = { meta_title: '', meta_description: '' };
    }
    if (row.key === 'meta_title' || row.key === 'meta_description') {
      translationMap[row.locale][row.key] = row.value || '';
    }
  });

  const suggestionSet = new Set<string>();
  characteristics.forEach((row) => suggestionSet.add(row.characteristic));
  cuisines.forEach((row) => suggestionSet.add(row.name));
  categories.forEach((row) => {
    if (row.name) suggestionSet.add(row.name);
  });

  return {
    id: rid,
    name: restaurant.name,
    active: restaurant.active,
    schedule_order: restaurant.schedule_order,
    delivery: restaurant.delivery,
    take_away: restaurant.take_away,
    free_delivery: restaurant.free_delivery,
    veg: restaurant.veg,
    non_veg: restaurant.non_veg,
    order_subscription_active: Boolean(restaurant.order_subscription_active),
    cutlery: restaurant.cutlery,
    manual_dispatch: manualDispatch,
    instant_order: Boolean(config?.instant_order),
    customer_date_order_sratus: Boolean(config?.customer_date_order_sratus),
    customer_order_date: asNumber(config?.customer_order_date),
    halal_tag_status: Boolean(config?.halal_tag_status),
    is_extra_packaging_active: Boolean(config?.is_extra_packaging_active),
    extra_packaging_status: Boolean(config?.extra_packaging_status),
    extra_packaging_amount: config?.extra_packaging_amount ?? null,
    dine_in: Boolean(config?.dine_in),
    schedule_advance_dine_in_booking_duration: asNumber(
      config?.schedule_advance_dine_in_booking_duration
    ),
    schedule_advance_dine_in_booking_duration_time_format:
      config?.schedule_advance_dine_in_booking_duration_time_format || 'min',
    minimum_order: asNumber(restaurant.minimum_order),
    gst_status: Boolean(asNumber(gst.status)),
    gst_code: gst.code != null ? String(gst.code) : '',
    minimum_delivery_charge: asNumber(restaurant.minimum_shipping_charge),
    per_km_delivery_charge: asNumber(restaurant.per_km_shipping_charge),
    maximum_shipping_charge:
      restaurant.maximum_shipping_charge == null ? null : asNumber(restaurant.maximum_shipping_charge),
    free_delivery_distance_status: Boolean(asNumber(freeDistance.status)),
    free_delivery_distance: freeDistance.value != null ? String(freeDistance.value) : '',
    cuisine_ids: cuisineIds,
    tags: tags.map((row) => row.tag),
    characteristics: selectedCharacteristics.map((row) => row.characteristic),
    meta_title: restaurant.meta_title || '',
    meta_description: restaurant.meta_description || '',
    meta_image: restaurant.meta_image || '',
    meta_image_url: metaImageUrl(restaurant.meta_image),
    translations: translationMap,
    schedules: schedules.map((row) => ({
      id: Number(row.id),
      day: asNumber(row.day),
      opening_time: formatTime(row.opening_time),
      closing_time: formatTime(row.closing_time),
    })),
    options: {
      cuisines: cuisines.map((row) => ({ id: Number(row.id), name: row.name })),
      characteristic_suggestions: Array.from(suggestionSet).sort((a, b) => a.localeCompare(b)),
      languages: parseLanguages(languageRaw),
    },
    flags: {
      toggle_veg_non_veg: toggleVegNonVeg,
      order_subscription: orderSubscription,
      extra_packaging_charge: extraPackagingCharge,
      dine_in_order_option: dineInOrderOption,
      self_delivery: selfDelivery,
      home_delivery_enabled: businessSettingFlagOn(homeDelivery),
      take_away_enabled: businessSettingFlagOn(takeAway),
      instant_order_enabled: businessSettingFlagOn(instantOrderSetting),
      schedule_order_enabled: businessSettingFlagOn(scheduleOrderSetting),
      manual_dispatch_available: manualDispatch !== null,
    },
  };
}
