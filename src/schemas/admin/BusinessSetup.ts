import Joi from 'joi';

const boolish = Joi.alternatives().try(Joi.boolean(), Joi.number().valid(0, 1), Joi.string().valid('0', '1', 'true', 'false'));

export const adminBusinessSetupTabQuerySchema = Joi.object({
  tab: Joi.string()
    .valid(
      'all',
      'business',
      'maintenance',
      'priority',
      'order',
      'refund',
      'restaurant',
      'deliveryman',
      'customer',
      'language',
      'landing',
      'disbursement',
      'app'
    )
    .optional()
    .default('all'),
});

export const adminUpdateMaintenanceSchema = Joi.object({
  mode: boolish.optional(),
  systems: Joi.array().items(Joi.string()).optional(),
  duration: Joi.object().unknown(true).optional(),
  message: Joi.object().unknown(true).optional(),
});

export const adminUpdateBusinessSchema = Joi.object({
  company: Joi.object({
    business_name: Joi.string().trim().max(191).optional(),
    restaurant_name: Joi.string().trim().max(191).optional(),
    email_address: Joi.string().email().allow('').optional(),
    email: Joi.string().email().allow('').optional(),
    phone: Joi.string().trim().max(30).allow('').optional(),
    country: Joi.string().trim().max(10).allow('').optional(),
    address: Joi.string().allow('').optional(),
    latitude: Joi.alternatives().try(Joi.string(), Joi.number()).optional(),
    longitude: Joi.alternatives().try(Joi.string(), Joi.number()).optional(),
    logo: Joi.string().allow('', null).optional(),
    icon: Joi.string().allow('', null).optional(),
  }).unknown(true).optional(),
  general: Joi.object({
    timezone: Joi.string().optional(),
    timeformat: Joi.string().valid('12', '24').optional(),
    time_format: Joi.string().valid('12', '24').optional(),
    currency: Joi.string().optional(),
    currency_symbol_position: Joi.string().valid('left', 'right').optional(),
    digit_after_decimal_point: Joi.number().integer().min(0).max(4).optional(),
    footer_text: Joi.string().allow('').optional(),
    cookies_text: Joi.string().allow('').optional(),
  }).unknown(true).optional(),
  rules: Joi.object({
    admin_commission: Joi.number().min(0).optional(),
    delivery_charge_comission: Joi.number().min(0).optional(),
    free_delivery_over_status: boolish.optional(),
    free_delivery_over: Joi.number().min(0).allow(null).optional(),
    free_delivery_distance_status: boolish.optional(),
    free_delivery_distance: Joi.number().min(0).allow(null).optional(),
    toggle_veg_non_veg: boolish.optional(),
    business_model: Joi.object({
      commission: boolish.optional(),
      subscription: boolish.optional(),
    }).optional(),
    tax_included: boolish.optional(),
    admin_order_notification: boolish.optional(),
    order_notification_type: Joi.string().valid('firebase', 'manual').optional(),
    additional_charge_status: boolish.optional(),
    additional_charge_name: Joi.string().allow('').optional(),
    additional_charge: Joi.number().min(0).allow(null).optional(),
    partial_payment_status: boolish.optional(),
    partial_payment_method: Joi.string().valid('cod', 'digital_payment', 'both').optional(),
    guest_checkout_status: boolish.optional(),
    country_picker_status: boolish.optional(),
  }).unknown(true).optional(),
}).unknown(true);

export const adminUpdateOrderSchema = Joi.object({
  home_delivery: boolish.optional(),
  take_away: boolish.optional(),
  instant_order: boolish.optional(),
  schedule_order: boolish.optional(),
  order_delivery_verification: boolish.optional(),
  odc: boolish.optional(),
  repeat_order_option: boolish.optional(),
  order_subscription: boolish.optional(),
  customer_date_order_sratus: boolish.optional(),
  customer_order_date: Joi.number().integer().min(0).optional(),
  canceled_by_restaurant: boolish.optional(),
  canceled_by_deliveryman: boolish.optional(),
  order_confirmation_model: Joi.string().optional(),
  schedule_order_slot_duration: Joi.number().min(0).optional(),
  schedule_order_slot_duration_time_formate: Joi.string().valid('min', 'hour').optional(),
  dine_in_order_option: boolish.optional(),
}).unknown(true);

export const adminUpdateRestaurantSchema = Joi.object({
  cash_in_hand_overflow_restaurant: boolish.optional(),
  cash_in_hand_overflow_restaurant_amount: Joi.number().min(0).optional(),
  min_amount_to_pay_restaurant: Joi.number().min(0).optional(),
  canceled_by_restaurant: boolish.optional(),
  toggle_restaurant_registration: boolish.optional(),
  restaurant_self_registration: boolish.optional(),
  restaurant_review_reply: boolish.optional(),
  extra_packaging_charge: boolish.optional(),
}).unknown(true);

export const adminUpdateDeliverymanSchema = Joi.object({
  min_amount_to_pay_dm: Joi.number().min(0).optional(),
  cash_in_hand_overflow_delivery_man: boolish.optional(),
  dm_tips_status: boolish.optional(),
  dm_maximum_orders: Joi.number().integer().min(0).optional(),
  canceled_by_deliveryman: boolish.optional(),
  show_dm_earning: boolish.optional(),
  toggle_dm_registration: boolish.optional(),
  dm_self_registration: boolish.optional(),
  dm_max_cash_in_hand: Joi.number().min(0).optional(),
  dm_picture_upload_status: boolish.optional(),
}).unknown(true);

export const adminUpdateCustomerSchema = Joi.object({
  wallet_status: boolish.optional(),
  customer_wallet: boolish.optional(),
  loyalty_point_status: boolish.optional(),
  customer_loyalty_point: boolish.optional(),
  wallet_add_refund: boolish.optional(),
  refund_to_wallet: boolish.optional(),
  add_fund_status: boolish.optional(),
  ref_earning_status: boolish.optional(),
  loyalty_point_exchange_rate: Joi.number().min(0).optional(),
  loyalty_point_item_purchase_point: Joi.number().min(0).optional(),
  item_purchase_point: Joi.number().min(0).optional(),
  loyalty_point_minimum_point: Joi.number().min(0).optional(),
  minimun_transfer_point: Joi.number().min(0).optional(),
  ref_earning_exchange_rate: Joi.number().min(0).optional(),
  new_customer_discount_status: boolish.optional(),
  new_customer_discount_amount: Joi.number().min(0).optional(),
  new_customer_discount_amount_type: Joi.string().valid('percentage', 'amount').optional(),
  new_customer_discount_amount_validity: Joi.number().integer().min(0).optional(),
  new_customer_discount_validity_type: Joi.string().valid('day', 'month', 'year').optional(),
}).unknown(true);

export const adminUpdatePrioritySchema = Joi.object({
  items: Joi.array()
    .items(
      Joi.object({
        key: Joi.string().required(),
        default_status: boolish.optional(),
        sort_by_general: Joi.string().allow(null, '').optional(),
        sort_by_unavailable: Joi.string().allow(null, '').optional(),
        sort_by_temp_closed: Joi.string().allow(null, '').optional(),
        sort_by_rating: Joi.string().allow(null, '').optional(),
      }).unknown(true)
    )
    .required(),
});

export const adminUpdateDisbursementSchema = Joi.object({
  disbursement_type: Joi.string().valid('manual', 'automated').optional(),
  restaurant_disbursement_time_period: Joi.string().optional(),
  restaurant_disbursement_week_start: Joi.string().optional(),
  restaurant_disbursement_waiting_time: Joi.alternatives().try(Joi.string(), Joi.number()).optional(),
  restaurant_disbursement_create_time: Joi.string().optional(),
  restaurant_disbursement_min_amount: Joi.number().min(0).optional(),
  dm_disbursement_time_period: Joi.string().optional(),
  dm_disbursement_week_start: Joi.string().optional(),
  dm_disbursement_waiting_time: Joi.alternatives().try(Joi.string(), Joi.number()).optional(),
  dm_disbursement_create_time: Joi.string().optional(),
  dm_disbursement_min_amount: Joi.number().min(0).optional(),
  system_php_path: Joi.string().allow('').optional(),
}).unknown(true);

export const adminUpdateLandingSchema = Joi.object({
  landing_integration_via: Joi.string().optional(),
  landing_page_url: Joi.string().allow('').optional(),
  landing_file: Joi.string().allow('', null).optional(),
}).unknown(true);

export const adminUpdateRefundSchema = Joi.object({
  refund_active_status: boolish.required(),
});

export const adminUpdateLanguageSchema = Joi.object({
  language: Joi.alternatives().try(Joi.array(), Joi.object(), Joi.string()).required(),
});

const appVersionField = Joi.alternatives()
  .try(Joi.string().trim().allow('', null), Joi.number())
  .optional();

export const adminUpdateAppSettingsSchema = Joi.object({
  app: Joi.string().valid('user', 'restaurant', 'deliveryman').default('user'),
  app_minimum_version_android: appVersionField,
  app_minimum_version_ios: appVersionField,
  app_url_android: Joi.string().trim().allow('', null).optional(),
  app_url_ios: Joi.string().trim().allow('', null).optional(),
});
