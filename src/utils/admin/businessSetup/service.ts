import prisma from '../../../config/database';
import { clearBusinessSettingsCache } from '../../consumer/businessSettings';
import {
  businessMediaUrl,
  flag01,
  getDataSettings,
  getPriorityLists,
  getSettingsMap,
  parseJsonValue,
  settingFlag,
  settingNumber,
  settingValue,
  upsertBusinessSetting,
  upsertBusinessSettings,
  upsertDataSetting,
  upsertPriorityList,
} from './store';

export const PRIORITY_ITEMS = [
  'popular_food',
  'popular_restaurant',
  'new_restaurant',
  'all_restaurant',
  'campaign_food',
  'best_reviewed_food',
  'category_list',
  'cuisine_list',
  'category_food',
  'search_bar',
] as const;

const BUSINESS_KEYS = [
  'maintenance_mode',
  'business_name',
  'email_address',
  'phone',
  'country',
  'address',
  'default_location',
  'logo',
  'icon',
  'timezone',
  'timeformat',
  'currency',
  'currency_symbol_position',
  'digit_after_decimal_point',
  'footer_text',
  'cookies_text',
  'admin_commission',
  'delivery_charge_comission',
  'free_delivery_over',
  'toggle_veg_non_veg',
  'business_model',
  'tax_included',
  'admin_order_notification',
  'order_notification_type',
  'additional_charge_status',
  'additional_charge_name',
  'additional_charge',
  'partial_payment_status',
  'partial_payment_method',
  'free_delivery_distance',
  'guest_checkout_status',
  'country_picker_status',
  'tax',
];

const ORDER_KEYS = [
  'order_delivery_verification',
  'home_delivery',
  'take_away',
  'instant_order',
  'repeat_order_option',
  'order_subscription',
  'schedule_order',
  'customer_date_order_sratus',
  'customer_order_date',
  'canceled_by_restaurant',
  'canceled_by_deliveryman',
  'order_confirmation_model',
  'schedule_order_slot_duration',
  'schedule_order_slot_duration_time_formate',
  'dine_in_order_option',
];

const RESTAURANT_KEYS = [
  'cash_in_hand_overflow_restaurant',
  'cash_in_hand_overflow_restaurant_amount',
  'min_amount_to_pay_restaurant',
  'canceled_by_restaurant',
  'toggle_restaurant_registration',
  'restaurant_review_reply',
  'extra_packaging_charge',
];

const DELIVERYMAN_KEYS = [
  'min_amount_to_pay_dm',
  'cash_in_hand_overflow_delivery_man',
  'dm_tips_status',
  'dm_maximum_orders',
  'canceled_by_deliveryman',
  'show_dm_earning',
  'toggle_dm_registration',
  'dm_max_cash_in_hand',
  'dm_picture_upload_status',
];

const CUSTOMER_KEYS = [
  'wallet_status',
  'loyalty_point_status',
  'wallet_add_refund',
  'add_fund_status',
  'ref_earning_status',
  'loyalty_point_exchange_rate',
  'loyalty_point_item_purchase_point',
  'loyalty_point_minimum_point',
  'ref_earning_exchange_rate',
  'new_customer_discount_status',
  'new_customer_discount_amount',
  'new_customer_discount_amount_type',
  'new_customer_discount_amount_validity',
  'new_customer_discount_validity_type',
];

const DISBURSEMENT_KEYS = [
  'disbursement_type',
  'restaurant_disbursement_time_period',
  'restaurant_disbursement_week_start',
  'restaurant_disbursement_waiting_time',
  'restaurant_disbursement_create_time',
  'restaurant_disbursement_min_amount',
  'dm_disbursement_time_period',
  'dm_disbursement_week_start',
  'dm_disbursement_waiting_time',
  'dm_disbursement_create_time',
  'dm_disbursement_min_amount',
  'system_php_path',
  'restaurant_disbursement_command',
  'dm_disbursement_command',
];

const LANDING_KEYS = ['landing_integration_via', 'landing_page_url', 'landing_file'];
const REFUND_KEYS = ['refund_active_status'];
const LANGUAGE_KEYS = ['language'];

async function getMaintenancePayload(map: Map<string, string | null>) {
  const data = await getDataSettings('maintenance_mode', [
    'maintenance_system_setup',
    'maintenance_duration_setup',
    'maintenance_message_setup',
  ]);
  return {
    mode: settingFlag(map, 'maintenance_mode'),
    systems: parseJsonValue<string[]>(data.get('maintenance_system_setup'), []),
    duration: parseJsonValue<Record<string, unknown>>(data.get('maintenance_duration_setup'), {
      maintenance_duration: 'until_change',
      start_date: null,
      end_date: null,
    }),
    message: parseJsonValue<Record<string, unknown>>(data.get('maintenance_message_setup'), {
      business_number: 0,
      business_email: 0,
      maintenance_message: '',
      message_body: '',
    }),
  };
}

function getBusinessPayload(map: Map<string, string | null>) {
  const location = parseJsonValue<{ lat?: string; lng?: string }>(
    settingValue(map, 'default_location'),
    { lat: '', lng: '' }
  );
  const businessModel = parseJsonValue<{ commission?: number; subscription?: number }>(
    settingValue(map, 'business_model'),
    { commission: 1, subscription: 0 }
  );
  const freeOver = settingValue(map, 'free_delivery_over');
  const freeDistance = settingValue(map, 'free_delivery_distance');

  return {
    company: {
      business_name: settingValue(map, 'business_name', ''),
      email_address: settingValue(map, 'email_address', ''),
      phone: settingValue(map, 'phone', ''),
      country: settingValue(map, 'country', 'IL'),
      address: settingValue(map, 'address', ''),
      latitude: location.lat ?? '',
      longitude: location.lng ?? '',
      logo: settingValue(map, 'logo'),
      logo_url: businessMediaUrl(settingValue(map, 'logo')),
      icon: settingValue(map, 'icon'),
      icon_url: businessMediaUrl(settingValue(map, 'icon')),
    },
    general: {
      timezone: settingValue(map, 'timezone', 'Asia/Jerusalem'),
      timeformat: settingValue(map, 'timeformat', '24'),
      currency: settingValue(map, 'currency', 'ILS'),
      currency_symbol_position: settingValue(map, 'currency_symbol_position', 'left'),
      digit_after_decimal_point: settingNumber(map, 'digit_after_decimal_point', 2),
      footer_text: settingValue(map, 'footer_text', ''),
      cookies_text: settingValue(map, 'cookies_text', ''),
    },
    rules: {
      admin_commission: settingNumber(map, 'admin_commission', 0),
      delivery_charge_comission: settingNumber(map, 'delivery_charge_comission', 0),
      free_delivery_over_status: freeOver != null && freeOver !== '',
      free_delivery_over: freeOver != null && freeOver !== '' ? Number(freeOver) : null,
      toggle_veg_non_veg: settingFlag(map, 'toggle_veg_non_veg'),
      business_model: {
        commission: Number(businessModel.commission ?? 0) === 1,
        subscription: Number(businessModel.subscription ?? 0) === 1,
      },
      tax_included: settingFlag(map, 'tax_included'),
      admin_order_notification: settingFlag(map, 'admin_order_notification'),
      order_notification_type: settingValue(map, 'order_notification_type', 'firebase'),
      additional_charge_status: settingFlag(map, 'additional_charge_status'),
      additional_charge_name: settingValue(map, 'additional_charge_name', ''),
      additional_charge: settingNumber(map, 'additional_charge', 0),
      partial_payment_status: settingFlag(map, 'partial_payment_status'),
      partial_payment_method: settingValue(map, 'partial_payment_method', 'both'),
      free_delivery_distance_status: freeDistance != null && freeDistance !== '',
      free_delivery_distance:
        freeDistance != null && freeDistance !== '' ? Number(freeDistance) : null,
      guest_checkout_status: settingFlag(map, 'guest_checkout_status'),
      country_picker_status: settingFlag(map, 'country_picker_status'),
    },
  };
}

function flagsFromKeys(map: Map<string, string | null>, keys: string[]) {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const raw = settingValue(map, key);
    if (raw == null) {
      out[key] = null;
      continue;
    }
    if (raw === '0' || raw === '1' || raw === 'true' || raw === 'false') {
      out[key] = raw === '1' || raw === 'true';
    } else if (raw !== '' && !Number.isNaN(Number(raw)) && String(Number(raw)) === raw) {
      out[key] = Number(raw);
    } else {
      out[key] = raw;
    }
  }
  return out;
}

async function getPriorityPayload(map: Map<string, string | null>) {
  const lists = await getPriorityLists();
  const items = PRIORITY_ITEMS.map((item) => {
    const defaultStatus = settingFlag(map, `${item}_default_status`, true);
    const find = (type: string) =>
      lists.find((l) => l.name === `${item}_sort_by_${type}` && l.type === type)?.value ?? null;
    return {
      key: item,
      default_status: defaultStatus,
      sort_by_general: find('general'),
      sort_by_unavailable: find('unavailable'),
      sort_by_temp_closed: find('temp_closed'),
      sort_by_rating: find('rating'),
    };
  });
  return { items };
}

export async function getBusinessSetup(tab?: string) {
  const allKeys = [
    ...BUSINESS_KEYS,
    ...ORDER_KEYS,
    ...RESTAURANT_KEYS,
    ...DELIVERYMAN_KEYS,
    ...CUSTOMER_KEYS,
    ...DISBURSEMENT_KEYS,
    ...LANDING_KEYS,
    ...REFUND_KEYS,
    ...LANGUAGE_KEYS,
    ...PRIORITY_ITEMS.map((i) => `${i}_default_status`),
  ];
  const map = await getSettingsMap(allKeys);
  const currencies = await prisma.currencies.findMany({
    orderBy: { country: 'asc' },
    select: {
      id: true,
      country: true,
      currency_code: true,
      currency_symbol: true,
    },
  });

  const maintenance = await getMaintenancePayload(map);
  const business = getBusinessPayload(map);
  const payload = {
    maintenance,
    business,
    order: flagsFromKeys(map, ORDER_KEYS),
    restaurant: flagsFromKeys(map, RESTAURANT_KEYS),
    deliveryman: {
      ...flagsFromKeys(map, DELIVERYMAN_KEYS),
      dm_self_registration: settingFlag(map, 'toggle_dm_registration'),
    },
    customer: {
      wallet_status: settingFlag(map, 'wallet_status'),
      loyalty_point_status: settingFlag(map, 'loyalty_point_status'),
      wallet_add_refund: settingFlag(map, 'wallet_add_refund'),
      add_fund_status: settingFlag(map, 'add_fund_status'),
      ref_earning_status: settingFlag(map, 'ref_earning_status'),
      loyalty_point_exchange_rate: settingNumber(map, 'loyalty_point_exchange_rate', 0),
      loyalty_point_item_purchase_point: settingNumber(map, 'loyalty_point_item_purchase_point', 0),
      loyalty_point_minimum_point: settingNumber(map, 'loyalty_point_minimum_point', 0),
      ref_earning_exchange_rate: settingNumber(map, 'ref_earning_exchange_rate', 0),
      new_customer_discount_status: settingFlag(map, 'new_customer_discount_status'),
      new_customer_discount_amount: settingNumber(map, 'new_customer_discount_amount', 0),
      new_customer_discount_amount_type: settingValue(map, 'new_customer_discount_amount_type', 'percentage'),
      new_customer_discount_amount_validity: settingNumber(map, 'new_customer_discount_amount_validity', 1),
      new_customer_discount_validity_type: settingValue(map, 'new_customer_discount_validity_type', 'day'),
    },
    priority: await getPriorityPayload(map),
    disbursement: flagsFromKeys(map, DISBURSEMENT_KEYS),
    landing: {
      landing_integration_via: settingValue(map, 'landing_integration_via', 'file_upload'),
      landing_page_url: settingValue(map, 'landing_page_url', ''),
      landing_file: settingValue(map, 'landing_file'),
      landing_file_url: businessMediaUrl(settingValue(map, 'landing_file')),
    },
    refund: {
      refund_active_status: settingFlag(map, 'refund_active_status'),
      reasons: (
        await prisma.refund_reasons.findMany({
          orderBy: { id: 'asc' },
          select: { id: true, reason: true, status: true },
        })
      ).map((r) => ({
        id: Number(r.id),
        reason: r.reason,
        status: r.status,
      })),
    },
    language: {
      language: parseJsonValue(settingValue(map, 'language'), []),
    },
    meta: {
      currencies: currencies.map((c) => ({
        id: Number(c.id),
        country: c.country,
        currency_code: c.currency_code,
        currency_symbol: c.currency_symbol,
      })),
    },
  };

  if (tab && tab !== 'all' && tab in payload) {
    return {
      tab,
      [tab]: (payload as Record<string, unknown>)[tab],
      meta: payload.meta,
      maintenance: payload.maintenance,
    };
  }

  return payload;
}

export async function updateMaintenance(body: {
  mode?: boolean | number | string;
  systems?: string[];
  duration?: Record<string, unknown>;
  message?: Record<string, unknown>;
}) {
  await upsertBusinessSetting('maintenance_mode', flag01(body.mode));
  if (body.systems) {
    await upsertDataSetting('maintenance_mode', 'maintenance_system_setup', JSON.stringify(body.systems));
  }
  if (body.duration) {
    await upsertDataSetting(
      'maintenance_mode',
      'maintenance_duration_setup',
      JSON.stringify(body.duration)
    );
  }
  if (body.message) {
    await upsertDataSetting(
      'maintenance_mode',
      'maintenance_message_setup',
      JSON.stringify(body.message)
    );
  }
  clearBusinessSettingsCache();
}

export async function updateBusinessTab(body: Record<string, any>) {
  const company = body.company ?? body;
  const general = body.general ?? body;
  const rules = body.rules ?? body;

  const commission = Boolean(rules.business_model?.commission ?? rules.commission);
  const subscription = Boolean(rules.business_model?.subscription ?? rules.subscription);
  if (!commission && !subscription) {
    throw new Error('You must select at least one business model between commission and subscription');
  }

  if (commission && !subscription) {
    const activeSubs = await prisma.restaurant_subscriptions.count({
      where: { status: true },
    }).catch(() => 0);
    if (activeSubs > 0) {
      throw new Error('You need to switch your subscribers to commission first');
    }
  }

  const lat = company.latitude ?? body.latitude;
  const lng = company.longitude ?? body.longitude;

  await upsertBusinessSettings({
    business_name: company.business_name ?? company.restaurant_name ?? body.restaurant_name,
    email_address: company.email_address ?? company.email ?? body.email,
    phone: company.phone ?? body.phone,
    country: company.country ?? body.country,
    address: company.address ?? body.address,
    default_location: JSON.stringify({ lat: String(lat ?? ''), lng: String(lng ?? '') }),
    logo: company.logo ?? body.logo,
    icon: company.icon ?? body.icon,
    timezone: general.timezone ?? body.timezone,
    timeformat: general.timeformat ?? general.time_format ?? body.time_format,
    currency: general.currency ?? body.currency,
    currency_symbol_position: general.currency_symbol_position ?? body.currency_symbol_position,
    digit_after_decimal_point:
      general.digit_after_decimal_point ?? body.digit_after_decimal_point,
    footer_text: general.footer_text ?? body.footer_text,
    cookies_text: general.cookies_text ?? body.cookies_text,
    admin_commission: rules.admin_commission ?? body.admin_commission,
    delivery_charge_comission:
      rules.delivery_charge_comission ??
      rules.admin_comission_in_delivery_charge ??
      body.admin_comission_in_delivery_charge,
    free_delivery_over: rules.free_delivery_over_status
      ? rules.free_delivery_over ?? body.free_delivery_over
      : null,
    free_delivery_distance: rules.free_delivery_distance_status
      ? rules.free_delivery_distance ?? body.free_delivery_distance
      : null,
    toggle_veg_non_veg: flag01(rules.toggle_veg_non_veg ?? rules.vnv ?? body.vnv),
    tax_included: flag01(rules.tax_included ?? body.tax_included),
    admin_order_notification: flag01(rules.admin_order_notification ?? body.admin_order_notification),
    order_notification_type: rules.order_notification_type ?? body.order_notification_type,
    additional_charge_status: flag01(rules.additional_charge_status ?? body.additional_charge_status),
    additional_charge_name: rules.additional_charge_name ?? body.additional_charge_name,
    additional_charge: rules.additional_charge ?? body.additional_charge,
    partial_payment_status: flag01(rules.partial_payment_status ?? body.partial_payment_status),
    partial_payment_method: rules.partial_payment_method ?? body.partial_payment_method,
    guest_checkout_status: flag01(rules.guest_checkout_status ?? body.guest_checkout_status),
    country_picker_status: flag01(rules.country_picker_status ?? body.country_picker_status),
    tax: rules.tax ?? body.tax,
    business_model: JSON.stringify({
      commission: commission ? 1 : 0,
      subscription: subscription ? 1 : 0,
    }),
  });

  if (commission && !subscription) {
    await prisma.restaurants.updateMany({ data: { restaurant_model: 'commission' } });
  } else if (subscription && !commission) {
    await prisma.restaurants.updateMany({
      where: { restaurant_model: 'commission' },
      data: { restaurant_model: 'unsubscribed', status: false },
    });
  }
}

export async function updateOrderTab(body: Record<string, any>) {
  const home = flag01(body.home_delivery, 0);
  const takeAway = flag01(body.take_away, 0);
  if (!home && !takeAway) {
    throw new Error('Can not disable both take away and delivery');
  }
  const instant = flag01(body.instant_order, 0);
  const schedule = flag01(body.schedule_order, 0);
  if (!instant && !schedule) {
    throw new Error('Can not disable both schedule order and instant order');
  }

  let slot = Number(body.schedule_order_slot_duration ?? 0);
  if (body.schedule_order_slot_duration_time_formate === 'hour') {
    slot = slot * 60;
  }

  await upsertBusinessSettings({
    instant_order: instant,
    customer_date_order_sratus: flag01(body.customer_date_order_sratus),
    customer_order_date: body.customer_order_date ?? 0,
    order_delivery_verification: flag01(body.order_delivery_verification ?? body.odc),
    schedule_order: schedule,
    home_delivery: home,
    take_away: takeAway,
    repeat_order_option: flag01(body.repeat_order_option),
    order_subscription: flag01(body.order_subscription),
    schedule_order_slot_duration: slot,
    schedule_order_slot_duration_time_formate:
      body.schedule_order_slot_duration_time_formate ?? 'min',
    canceled_by_restaurant: flag01(body.canceled_by_restaurant),
    canceled_by_deliveryman: flag01(body.canceled_by_deliveryman),
    order_confirmation_model: body.order_confirmation_model ?? 'deliveryman',
    dine_in_order_option: flag01(body.dine_in_order_option),
  });

  if (!takeAway) {
    await prisma.restaurants.updateMany({ where: { take_away: true }, data: { take_away: false } });
  }
  if (!home) {
    await prisma.restaurants.updateMany({ where: { delivery: true }, data: { delivery: false } });
  }
}

export async function updateRestaurantTab(body: Record<string, any>) {
  await upsertBusinessSettings({
    cash_in_hand_overflow_restaurant: flag01(body.cash_in_hand_overflow_restaurant),
    cash_in_hand_overflow_restaurant_amount: body.cash_in_hand_overflow_restaurant_amount ?? 0,
    min_amount_to_pay_restaurant: body.min_amount_to_pay_restaurant ?? 0,
    canceled_by_restaurant: flag01(body.canceled_by_restaurant),
    toggle_restaurant_registration: flag01(
      body.toggle_restaurant_registration ?? body.restaurant_self_registration
    ),
    restaurant_review_reply: flag01(body.restaurant_review_reply),
    extra_packaging_charge: flag01(body.extra_packaging_charge),
  });
}

export async function updateDeliverymanTab(body: Record<string, any>) {
  await upsertBusinessSettings({
    min_amount_to_pay_dm: body.min_amount_to_pay_dm ?? 0,
    cash_in_hand_overflow_delivery_man: flag01(body.cash_in_hand_overflow_delivery_man),
    dm_tips_status: flag01(body.dm_tips_status),
    dm_maximum_orders: body.dm_maximum_orders ?? 0,
    canceled_by_deliveryman: flag01(body.canceled_by_deliveryman),
    show_dm_earning: flag01(body.show_dm_earning),
    toggle_dm_registration: flag01(body.toggle_dm_registration ?? body.dm_self_registration),
    dm_max_cash_in_hand: body.dm_max_cash_in_hand ?? 0,
    dm_picture_upload_status: flag01(body.dm_picture_upload_status),
  });
}

export async function updateCustomerTab(body: Record<string, any>) {
  await upsertBusinessSettings({
    wallet_status: flag01(body.wallet_status ?? body.customer_wallet),
    loyalty_point_status: flag01(body.loyalty_point_status ?? body.customer_loyalty_point),
    ref_earning_status: flag01(body.ref_earning_status),
    wallet_add_refund: flag01(body.wallet_add_refund ?? body.refund_to_wallet),
    loyalty_point_exchange_rate: body.loyalty_point_exchange_rate ?? 0,
    ref_earning_exchange_rate: body.ref_earning_exchange_rate ?? 0,
    loyalty_point_item_purchase_point:
      body.loyalty_point_item_purchase_point ?? body.item_purchase_point ?? 0,
    loyalty_point_minimum_point:
      body.loyalty_point_minimum_point ?? body.minimun_transfer_point ?? 0,
    add_fund_status: flag01(body.add_fund_status),
    new_customer_discount_status: flag01(body.new_customer_discount_status),
    new_customer_discount_amount: body.new_customer_discount_amount ?? 0,
    new_customer_discount_amount_type: body.new_customer_discount_amount_type ?? 'percentage',
    new_customer_discount_amount_validity: body.new_customer_discount_amount_validity ?? 1,
    new_customer_discount_validity_type: body.new_customer_discount_validity_type ?? 'day',
  });
}

export async function updatePriorityTab(body: { items?: Array<Record<string, any>> }) {
  const items = body.items ?? [];
  for (const item of items) {
    const key = String(item.key || '');
    if (!PRIORITY_ITEMS.includes(key as (typeof PRIORITY_ITEMS)[number])) continue;
    const defaultStatus = flag01(item.default_status, 1);
    await upsertBusinessSetting(`${key}_default_status`, defaultStatus);
    if (defaultStatus === 0) {
      if (!item.sort_by_general && key !== 'search_bar') {
        throw new Error(`You must select an option for ${key}`);
      }
      if (item.sort_by_general) {
        await upsertPriorityList(`${key}_sort_by_general`, 'general', String(item.sort_by_general));
      }
      if (item.sort_by_unavailable) {
        await upsertPriorityList(
          `${key}_sort_by_unavailable`,
          'unavailable',
          String(item.sort_by_unavailable)
        );
      }
      if (item.sort_by_temp_closed) {
        await upsertPriorityList(
          `${key}_sort_by_temp_closed`,
          'temp_closed',
          String(item.sort_by_temp_closed)
        );
      }
      if (item.sort_by_rating) {
        await upsertPriorityList(`${key}_sort_by_rating`, 'rating', String(item.sort_by_rating));
      }
    }
  }
  clearBusinessSettingsCache();
}

export async function updateDisbursementTab(body: Record<string, any>) {
  await upsertBusinessSettings({
    disbursement_type: body.disbursement_type ?? 'manual',
    restaurant_disbursement_time_period: body.restaurant_disbursement_time_period,
    restaurant_disbursement_week_start: body.restaurant_disbursement_week_start,
    restaurant_disbursement_waiting_time: body.restaurant_disbursement_waiting_time,
    restaurant_disbursement_create_time: body.restaurant_disbursement_create_time,
    restaurant_disbursement_min_amount: body.restaurant_disbursement_min_amount,
    dm_disbursement_time_period: body.dm_disbursement_time_period,
    dm_disbursement_week_start: body.dm_disbursement_week_start,
    dm_disbursement_waiting_time: body.dm_disbursement_waiting_time,
    dm_disbursement_create_time: body.dm_disbursement_create_time,
    dm_disbursement_min_amount: body.dm_disbursement_min_amount,
    system_php_path: body.system_php_path,
  });
}

export async function updateLandingTab(body: Record<string, any>) {
  await upsertBusinessSettings({
    landing_integration_via: body.landing_integration_via ?? 'file_upload',
    landing_page_url: body.landing_page_url ?? '',
    landing_file: body.landing_file,
  });
}

export async function updateRefundTab(body: Record<string, any>) {
  await upsertBusinessSettings({
    refund_active_status: flag01(body.refund_active_status),
  });
}

export async function updateLanguageTab(body: Record<string, any>) {
  await upsertBusinessSettings({
    language: typeof body.language === 'string' ? body.language : JSON.stringify(body.language ?? []),
  });
}
