import prisma from '../../config/database';
import { publicMediaUrl } from '../mediaStorage';
import { CONFIG_BUSINESS_SETTING_KEYS } from './businessSettingKeys';
import {
  getDataSettingInt,
  getDataSettingLocalized,
  loadJsonDataSetting,
} from './dataSettings';

function s(map: Map<string, string | null>, key: string): string {
  return map.get(key) ?? '';
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw?.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function bool(raw: string | null | undefined): boolean {
  return raw === '1' || raw === 'true' || raw === 'TRUE';
}

function num(raw: string | null | undefined, fallback = 0): number {
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

async function loadBusinessSettingsMap(): Promise<Map<string, string | null>> {
  const rows = await prisma.business_settings.findMany({
    where: { key: { in: [...CONFIG_BUSINESS_SETTING_KEYS] } },
    select: { key: true, value: true },
  });
  const map = new Map<string, string | null>();
  for (const key of CONFIG_BUSINESS_SETTING_KEYS) {
    map.set(key, null);
  }
  for (const row of rows) {
    map.set(row.key, row.value);
  }
  return map;
}

function parseSocialLoginBlocks(raw: string | null): Array<{
  login_medium: string;
  status: boolean;
  client_id?: string;
}> {
  const parsed = parseJson<unknown[]>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((x) => x && typeof x === 'object')
    .map((x) => {
      const o = x as Record<string, unknown>;
      const block: { login_medium: string; status: boolean; client_id?: string } = {
        login_medium: String(o.login_medium ?? ''),
        status: bool(String(o.status ?? '0')),
      };
      if (o.client_id != null) block.client_id = String(o.client_id);
      return block;
    });
}

/** Legacy PHP GET /api/v1/config — flat JSON (no status/msg wrapper). */
export async function buildAppConfiguration(locale?: string): Promise<Record<string, unknown>> {
  const settings = await loadBusinessSettingsMap();

  const defaultLocation = parseJson<{ lat?: string; lng?: string }>(
    s(settings, 'default_location'),
    {}
  );

  const cod = parseJson<{ status?: number }>(s(settings, 'cash_on_delivery'), { status: 0 });
  const digital = parseJson<{ status?: number }>(s(settings, 'digital_payment'), { status: 0 });
  const businessPlan = parseJson<{ commission?: number; subscription?: number }>(
    s(settings, 'business_model'),
    { commission: 1, subscription: 0 }
  );

  const freeTrialRaw = parseJson<{ status?: number; data?: number }>(
    s(settings, 'free_trial_period'),
    { status: 0, data: 0 }
  );

  const currencyCode = s(settings, 'currency') || 'USD';
  const currencyRow = await prisma.currencies.findFirst({
    where: { currency_code: currencyCode },
    select: { currency_symbol: true },
  });

  const languages = parseJson<string[]>(s(settings, 'language'), ['en']);
  const langArray = languages.map((code) => ({
    key: code,
    value: code,
  }));

  const socialMedia = await prisma.social_media.findMany({
    where: { status: true },
  });

  const [
    terms_and_conditions,
    privacy_policy,
    about_us,
    refund_policy_data,
    cancellation_policy_data,
    shipping_policy_data,
    refund_policy_status,
    cancellation_policy_status,
    shipping_policy_status,
    deliverymanPage,
    restaurantPage,
    maintenanceRows,
    bannerTitle,
    bannerImage,
  ] = await Promise.all([
    getDataSettingLocalized('terms_and_conditions', locale),
    getDataSettingLocalized('privacy_policy', locale),
    getDataSettingLocalized('about_us', locale),
    getDataSettingLocalized('refund_policy', locale),
    getDataSettingLocalized('cancellation_policy', locale),
    getDataSettingLocalized('shipping_policy', locale),
    getDataSettingInt('refund_policy_status'),
    getDataSettingInt('cancellation_policy_status'),
    getDataSettingInt('shipping_policy_status'),
    loadJsonDataSetting('deliveryman', 'deliveryman_page_data'),
    loadJsonDataSetting('restaurant', 'restaurant_page_data'),
    prisma.data_settings.findMany({
      where: {
        type: 'maintenance_mode',
        key: {
          in: ['maintenance_system_setup', 'maintenance_duration_setup', 'maintenance_message_setup'],
        },
      },
      select: { key: true, value: true },
    }),
    prisma.data_settings.findFirst({
      where: { type: 'promotional_banner', key: 'promotional_banner_title' },
      select: { value: true },
    }),
    prisma.data_settings.findFirst({
      where: { type: 'promotional_banner', key: 'promotional_banner_image' },
      select: { value: true },
    }),
  ]);

  const maintenance_mode_data: Record<string, unknown> = {};
  for (const row of maintenanceRows) {
    if (row.value) {
      try {
        maintenance_mode_data[row.key] = JSON.parse(row.value);
      } catch {
        maintenance_mode_data[row.key] = row.value;
      }
    }
  }

  const banner_data: Record<string, string> = {};
  if (bannerTitle?.value) banner_data.promotional_banner_title = bannerTitle.value;
  if (bannerImage?.value) {
    banner_data.promotional_banner_image = bannerImage.value;
    const full = publicMediaUrl(bannerImage.value);
    if (full) banner_data.promotional_banner_image_full_url = full;
  }

  const logo = s(settings, 'logo');
  const icon = s(settings, 'icon');

  let subscriptionFreeTrialDays = num(s(settings, 'subscription_free_trial_days'));
  const trialType = s(settings, 'subscription_free_trial_type') || 'day';
  if (trialType === 'year') {
    subscriptionFreeTrialDays =
      subscriptionFreeTrialDays > 0 ? subscriptionFreeTrialDays / 365 : 0;
  } else if (trialType === 'month') {
    subscriptionFreeTrialDays =
      subscriptionFreeTrialDays > 0 ? subscriptionFreeTrialDays / 30 : 0;
  }

  const orderConfirmationModel =
    process.env.ORDER_CONFIRMATION_MODEL ?? 'restaurant';

  const commissionOn = businessPlan.commission === 1;
  const subscriptionOn = businessPlan.subscription === 1;

  return {
    business_name: s(settings, 'business_name'),
    logo,
    logo_full_url: publicMediaUrl(logo),
    address: s(settings, 'address'),
    phone: s(settings, 'phone'),
    email: s(settings, 'email_address'),
    country: s(settings, 'country'),
    default_location: {
      lat: defaultLocation.lat ?? '23.757989',
      lng: defaultLocation.lng ?? '90.360587',
    },
    map_api_key: s(settings, 'map_api_key') || null,
    map_api_key_server: s(settings, 'map_api_key_server') || null,
    currency_symbol: currencyRow?.currency_symbol ?? '$',
    currency_symbol_direction: s(settings, 'currency_symbol_position'),
    app_minimum_version_android: num(s(settings, 'app_minimum_version_android')),
    app_url_android: s(settings, 'app_url_android'),
    app_minimum_version_ios: num(s(settings, 'app_minimum_version_ios')),
    app_url_ios: s(settings, 'app_url_ios'),
    customer_verification: bool(s(settings, 'customer_verification')),
    schedule_order: bool(s(settings, 'schedule_order')),
    order_delivery_verification: bool(s(settings, 'order_delivery_verification')),
    cash_on_delivery: cod.status === 1,
    digital_payment: digital.status === 1,
    free_delivery_over: s(settings, 'free_delivery_over')
      ? num(s(settings, 'free_delivery_over'))
      : null,
    free_delivery_distance: num(s(settings, 'free_delivery_distance')),
    demo: process.env.APP_MODE === 'demo',
    maintenance_mode: bool(s(settings, 'maintenance_mode')),
    order_confirmation_model: orderConfirmationModel,
    popular_food: num(s(settings, 'popular_food')),
    popular_restaurant: num(s(settings, 'popular_restaurant')),
    new_restaurant: num(s(settings, 'new_restaurant')),
    most_reviewed_foods: num(s(settings, 'most_reviewed_foods')),
    show_dm_earning: bool(s(settings, 'show_dm_earning')),
    canceled_by_deliveryman: bool(s(settings, 'canceled_by_deliveryman')),
    canceled_by_restaurant: bool(s(settings, 'canceled_by_restaurant')),
    timeformat: s(settings, 'timeformat') || '12',
    language: langArray,
    toggle_veg_non_veg: bool(s(settings, 'toggle_veg_non_veg')),
    toggle_dm_registration: bool(s(settings, 'toggle_dm_registration')),
    toggle_restaurant_registration: bool(s(settings, 'toggle_restaurant_registration')),
    schedule_order_slot_duration: num(s(settings, 'schedule_order_slot_duration')),
    digit_after_decimal_point: num(process.env.ROUND_UP_TO_DIGIT, 2),
    loyalty_point_exchange_rate: num(s(settings, 'loyalty_point_exchange_rate')),
    loyalty_point_item_purchase_point: num(s(settings, 'loyalty_point_item_purchase_point')),
    loyalty_point_status: num(s(settings, 'loyalty_point_status')),
    minimum_point_to_transfer: num(s(settings, 'loyalty_point_minimum_point')),
    customer_wallet_status: num(s(settings, 'wallet_status')),
    ref_earning_status: num(s(settings, 'ref_earning_status')),
    ref_earning_exchange_rate: num(s(settings, 'ref_earning_exchange_rate')),
    dm_tips_status: num(s(settings, 'dm_tips_status')),
    theme: num(s(settings, 'theme')),
    social_media: socialMedia.map((row) => ({
      id: Number(row.id),
      name: row.name,
      link: row.link,
      status: row.status,
    })),
    social_login: parseSocialLoginBlocks(s(settings, 'social_login')),
    business_plan: businessPlan,
    admin_commission: num(s(settings, 'admin_commission')),
    footer_text: s(settings, 'footer_text'),
    fav_icon: icon,
    fav_icon_full_url: publicMediaUrl(icon),
    refund_active_status: bool(s(settings, 'refund_active_status')),
    free_trial_period_status: freeTrialRaw.status ?? 0,
    free_trial_period_data: freeTrialRaw.data ?? 0,
    app_minimum_version_android_restaurant: num(
      s(settings, 'app_minimum_version_android_restaurant')
    ),
    app_url_android_restaurant: s(settings, 'app_url_android_restaurant') || null,
    app_minimum_version_ios_restaurant: num(s(settings, 'app_minimum_version_ios_restaurant')),
    app_url_ios_restaurant: s(settings, 'app_url_ios_restaurant') || null,
    app_minimum_version_android_deliveryman: num(
      s(settings, 'app_minimum_version_android_deliveryman')
    ),
    app_url_android_deliveryman: s(settings, 'app_url_android_deliveryman') || null,
    app_minimum_version_ios_deliveryman: num(s(settings, 'app_minimum_version_ios_deliveryman')),
    app_url_ios_deliveryman: s(settings, 'app_url_ios_deliveryman') || null,
    tax_included: num(s(settings, 'tax_included')),
    apple_login: parseSocialLoginBlocks(s(settings, 'apple_login')),
    order_subscription: num(s(settings, 'order_subscription')),
    cookies_text: s(settings, 'cookies_text'),
    refund_policy_status,
    cancellation_policy_status,
    shipping_policy_status,
    refund_policy_data,
    cancellation_policy_data,
    shipping_policy_data,
    terms_and_conditions,
    privacy_policy,
    about_us,
    take_away: bool(s(settings, 'take_away')),
    repeat_order_option: bool(s(settings, 'repeat_order_option')),
    home_delivery: bool(s(settings, 'home_delivery')),
    active_payment_method_list: [],
    add_fund_status: num(s(settings, 'add_fund_status')),
    partial_payment_status: num(s(settings, 'partial_payment_status')),
    partial_payment_method: s(settings, 'partial_payment_method'),
    additional_charge_status: num(s(settings, 'additional_charge_status')),
    additional_charge_name: s(settings, 'additional_charge_name') || 'Service Charge',
    additional_charge: num(s(settings, 'additional_charge')),
    dm_picture_upload_status: num(s(settings, 'dm_picture_upload_status')),
    digital_payment_info: {
      digital_payment: digital.status === 1,
      plugin_payment_gateways: false,
      default_payment_gateways: true,
    },
    banner_data: Object.keys(banner_data).length ? banner_data : null,
    offline_payment_status: num(s(settings, 'offline_payment_status')),
    guest_checkout_status: num(s(settings, 'guest_checkout_status')),
    country_picker_status: num(s(settings, 'country_picker_status')),
    instant_order: bool(s(settings, 'instant_order')),
    extra_packaging_charge: bool(s(settings, 'extra_packaging_charge')),
    customer_date_order_sratus: bool(s(settings, 'customer_date_order_sratus')),
    customer_order_date: num(s(settings, 'customer_order_date')),
    deliveryman_additional_join_us_page_data: deliverymanPage,
    restaurant_additional_join_us_page_data: restaurantPage,
    disbursement_type: s(settings, 'disbursement_type') || 'manual',
    restaurant_disbursement_waiting_time: num(s(settings, 'restaurant_disbursement_waiting_time')),
    dm_disbursement_waiting_time: num(s(settings, 'dm_disbursement_waiting_time')),
    min_amount_to_pay_restaurant: num(s(settings, 'min_amount_to_pay_restaurant')),
    min_amount_to_pay_dm: num(s(settings, 'min_amount_to_pay_dm')),
    restaurant_review_reply: bool(s(settings, 'restaurant_review_reply')),
    maintenance_mode_data:
      Object.keys(maintenance_mode_data).length > 0 ? maintenance_mode_data : null,
    firebase_otp_verification: num(s(settings, 'firebase_otp_verification')),
    centralize_login: {
      manual_login_status: num(s(settings, 'manual_login_status')),
      otp_login_status: num(s(settings, 'otp_login_status')),
      social_login_status: num(s(settings, 'social_login_status')),
      google_login_status: num(s(settings, 'google_login_status')),
      facebook_login_status: num(s(settings, 'facebook_login_status')),
      apple_login_status: num(s(settings, 'apple_login_status')),
      email_verification_status: num(s(settings, 'email_verification_status')),
      phone_verification_status: num(s(settings, 'phone_verification_status')),
    },
    subscription_business_model: subscriptionOn ? 1 : 0,
    commission_business_model: commissionOn ? 1 : 0,
    subscription_deadline_warning_days: num(s(settings, 'subscription_deadline_warning_days'), 1),
    subscription_deadline_warning_message:
      s(settings, 'subscription_deadline_warning_message') || null,
    subscription_free_trial_days: subscriptionFreeTrialDays,
    subscription_free_trial_type: trialType,
    subscription_free_trial_status: num(s(settings, 'subscription_free_trial_status')),
    dine_in_order_option: num(s(settings, 'dine_in_order_option')),
  };
}
