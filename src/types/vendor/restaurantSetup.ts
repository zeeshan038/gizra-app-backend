import { restaurants } from '@prisma/client';

export const RESTAURANT_TRANSLATION_TYPE = 'App\\Models\\Restaurant';

export const RESTAURANT_TOGGLE_KEYS = [
  'schedule_order',
  'delivery',
  'take_away',
  'free_delivery',
  'veg',
  'non_veg',
  'order_subscription_active',
  'cutlery',
  'manual_dispatch',
  'instant_order',
  'customer_date_order_sratus',
  'halal_tag_status',
  'is_extra_packaging_active',
  'dine_in',
] as const;

export type RestaurantToggleKey = (typeof RESTAURANT_TOGGLE_KEYS)[number];

export const RESTAURANT_CONFIG_TOGGLE_KEYS = [
  'instant_order',
  'customer_date_order_sratus',
  'halal_tag_status',
  'is_extra_packaging_active',
  'dine_in',
] as const;

export type RestaurantConfigToggleKey = (typeof RESTAURANT_CONFIG_TOGGLE_KEYS)[number];

export const RESTAURANT_CONFIG_TOGGLE_KEY_SET = new Set<string>(RESTAURANT_CONFIG_TOGGLE_KEYS);

export type VendorRestaurantRow = restaurants;

export type VendorRestaurantContext = {
  vendorId: number;
  restaurantId: number;
};

export type VendorRestaurantLoadResult = {
  ctx: VendorRestaurantContext;
  restaurant: VendorRestaurantRow;
};

/** HTTP-layer error returned from vendor setup utils (map to JSON in controller). */
export type VendorSetupActionError = {
  status: number;
  msg: string;
};

export type DineInDurationFormat = 'min' | 'hour' | 'day';

export type RestaurantActiveBody = {
  closed: boolean;
};

export type RestaurantToggleBody = {
  key: RestaurantToggleKey;
  status: boolean;
};

export type RestaurantSetupUpdateBody = {
  minimum_order: number;
  gst_status: boolean;
  gst_code: string;
  cuisine_ids: number[];
  tags: string[];
  characteristics: string[];
  customer_order_date?: number;
  extra_packaging_status?: boolean;
  extra_packaging_amount?: number | null;
  minimum_delivery_charge?: number;
  per_km_delivery_charge?: number;
  maximum_shipping_charge?: number | null;
  free_delivery_distance_status?: boolean;
  free_delivery_distance?: string;
  schedule_advance_dine_in_booking_duration?: number;
  schedule_advance_dine_in_booking_duration_time_format?: DineInDurationFormat;
};

export type RestaurantMetaTranslationInput = {
  locale: string;
  meta_title?: string;
  meta_description?: string;
};

export type RestaurantMetaUpdateBody = {
  meta_title: string;
  meta_description: string;
  meta_image?: string | null;
  translations: RestaurantMetaTranslationInput[];
};

export type RestaurantScheduleBody = {
  day: number;
  start_time: string;
  end_time: string;
};

export type RestaurantSetupLanguageOption = {
  code: string;
  label: string;
};

export type RestaurantSetupScheduleItem = {
  id: number;
  day: number;
  opening_time: string;
  closing_time: string;
};

export type RestaurantMetaLocaleStrings = {
  meta_title: string;
  meta_description: string;
};

export type RestaurantSetupFlags = {
  toggle_veg_non_veg: boolean;
  order_subscription: boolean;
  extra_packaging_charge: boolean;
  dine_in_order_option: boolean;
  self_delivery: boolean;
  home_delivery_enabled: boolean;
  take_away_enabled: boolean;
  instant_order_enabled: boolean;
  schedule_order_enabled: boolean;
  manual_dispatch_available: boolean;
};

export type RestaurantSetupOptions = {
  cuisines: Array<{ id: number; name: string }>;
  characteristic_suggestions: string[];
  languages: RestaurantSetupLanguageOption[];
};

export type RestaurantSetupPayload = {
  id: number;
  name: string;
  active: boolean;
  schedule_order: boolean;
  delivery: boolean;
  take_away: boolean;
  free_delivery: boolean;
  veg: boolean;
  non_veg: boolean;
  order_subscription_active: boolean;
  cutlery: boolean;
  manual_dispatch: boolean | null;
  instant_order: boolean;
  customer_date_order_sratus: boolean;
  customer_order_date: number;
  halal_tag_status: boolean;
  is_extra_packaging_active: boolean;
  extra_packaging_status: boolean;
  extra_packaging_amount: unknown;
  dine_in: boolean;
  schedule_advance_dine_in_booking_duration: number;
  schedule_advance_dine_in_booking_duration_time_format: string;
  minimum_order: number;
  gst_status: boolean;
  gst_code: string;
  minimum_delivery_charge: number;
  per_km_delivery_charge: number;
  maximum_shipping_charge: number | null;
  free_delivery_distance_status: boolean;
  free_delivery_distance: string;
  cuisine_ids: number[];
  tags: string[];
  characteristics: string[];
  meta_title: string;
  meta_description: string;
  meta_image: string;
  meta_image_url: string | null;
  translations: Record<string, RestaurantMetaLocaleStrings>;
  schedules: RestaurantSetupScheduleItem[];
  options: RestaurantSetupOptions;
  flags: RestaurantSetupFlags;
};
