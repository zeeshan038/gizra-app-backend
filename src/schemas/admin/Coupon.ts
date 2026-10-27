import Joi from 'joi';

const titleTranslationsSchema = Joi.object({
  default: Joi.string().trim().max(191).required(),
  en: Joi.string().trim().max(191).allow('').optional(),
  he: Joi.string().trim().max(191).allow('').optional(),
});

const couponBodyFields = {
  titles: titleTranslationsSchema.required(),
  code: Joi.string().trim().max(100).required(),
  coupon_type: Joi.string()
    .valid('zone_wise', 'restaurant_wise', 'free_delivery', 'first_order', 'default')
    .required(),
  zone_ids: Joi.array().items(Joi.number().integer()).when('coupon_type', {
    is: 'zone_wise',
    then: Joi.array().min(1).required(),
    otherwise: Joi.array().optional(),
  }),
  restaurant_ids: Joi.array().items(Joi.number().integer()).when('coupon_type', {
    is: 'restaurant_wise',
    then: Joi.array().min(1).required(),
    otherwise: Joi.array().optional(),
  }),
  customer_ids: Joi.array()
    .items(Joi.alternatives().try(Joi.number().integer(), Joi.string().valid('all')))
    .optional()
    .default(['all']),
  limit: Joi.number().integer().min(1).max(100).allow(null).optional(),
  start_date: Joi.date().required(),
  expire_date: Joi.date().min(Joi.ref('start_date')).required(),
  discount: Joi.number().min(0).required(),
  discount_type: Joi.string().valid('amount', 'percent', 'percentage').default('amount'),
  max_discount: Joi.number().min(0).default(0),
  min_purchase: Joi.number().min(0).default(0),
};

export const adminCouponCreateSchema = Joi.object(couponBodyFields);
export const adminCouponUpdateSchema = Joi.object(couponBodyFields);

export const adminCouponListQuerySchema = Joi.object({
  search: Joi.string().trim().max(200).optional().allow(''),
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(1).max(100).optional().default(15),
});

export const adminCouponStatusSchema = Joi.object({
  status: Joi.boolean().required(),
});
