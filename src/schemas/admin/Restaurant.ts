import Joi from 'joi';

const localeNamesSchema = Joi.object({
  default: Joi.string().trim().max(191).required(),
  en: Joi.string().trim().max(191).optional().allow('', null),
  he: Joi.string().trim().max(191).optional().allow('', null),
});

const localeAddressesSchema = Joi.object({
  default: Joi.string().trim().max(1000).required(),
  en: Joi.string().trim().max(1000).optional().allow('', null),
  he: Joi.string().trim().max(1000).optional().allow('', null),
});

export const adminCreateRestaurantSchema = Joi.object({
  f_name: Joi.string().trim().max(100).required(),
  l_name: Joi.string().trim().max(100).optional().allow('', null),
  phone: Joi.string().trim().max(20).required(),
  email: Joi.string().trim().email().max(100).required(),
  password: Joi.string().min(8).required(),
  names: localeNamesSchema.required(),
  addresses: localeAddressesSchema.required(),
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
  zone_id: Joi.number().integer().required(),
  tax: Joi.number().min(0).required(),
  minimum_delivery_time: Joi.number().integer().required(),
  maximum_delivery_time: Joi.number().integer().greater(Joi.ref('minimum_delivery_time')).required(),
  delivery_time_type: Joi.string().valid('min', 'hours').required(),
  cuisine_ids: Joi.array().items(Joi.number().integer()).optional(),
  tags: Joi.array().items(Joi.string().trim().max(255)).optional(),
  logo: Joi.string().trim().max(191).required(),
  cover_photo: Joi.string().trim().max(191).required(),
});

export const adminRestaurantListQuerySchema = Joi.object({
  search: Joi.string().trim().max(200).optional().allow(''),
  zone_id: Joi.alternatives()
    .try(Joi.number().integer(), Joi.string().valid('all'))
    .optional()
    .default('all'),
  cuisine_id: Joi.alternatives()
    .try(Joi.number().integer(), Joi.string().valid('all'))
    .optional()
    .default('all'),
  type: Joi.string()
    .valid('all', 'veg', 'non_veg', 'home_delivery', 'take_away', 'dine_in')
    .optional()
    .default('all'),
  restaurant_model: Joi.string()
    .valid('all', 'commission', 'subscribed', 'unsubscribed', 'none', '')
    .optional()
    .default('all'),
  active_only: Joi.string().valid('0', '1').optional().default('1'),
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(100).optional(),
});

export const adminRestaurantJoinQuerySchema = Joi.object({
  tab: Joi.string().valid('pending', 'denied').optional(),
  search: Joi.string().trim().max(200).optional().allow(''),
  zone_id: Joi.alternatives()
    .try(Joi.number().integer(), Joi.string().valid('all'))
    .optional()
    .default('all'),
  type: Joi.string()
    .valid('all', 'veg', 'non_veg', 'home_delivery', 'take_away', 'dine_in')
    .optional()
    .default('all'),
  restaurant_model: Joi.string()
    .valid('all', 'commission', 'subscribed', 'unsubscribed', 'none', '')
    .optional()
    .default('all'),
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(1).max(100).optional().default(15),
});

export const adminRestaurantBulkExportSchema = Joi.object({
  type: Joi.string().valid('all', 'date_wise', 'id_wise').required(),
  start_id: Joi.when('type', { is: 'id_wise', then: Joi.number().integer().min(0).required(), otherwise: Joi.optional() }),
  end_id: Joi.when('type', { is: 'id_wise', then: Joi.number().integer().min(Joi.ref('start_id')).required(), otherwise: Joi.optional() }),
  from_date: Joi.when('type', { is: 'date_wise', then: Joi.string().isoDate().required(), otherwise: Joi.optional() }),
  to_date: Joi.when('type', { is: 'date_wise', then: Joi.string().isoDate().required(), otherwise: Joi.optional() }),
});
