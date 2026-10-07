import Joi from 'joi';

const titleTranslationsSchema = Joi.object({
  default: Joi.string().trim().required(),
  en: Joi.string().trim().allow('').optional(),
  he: Joi.string().trim().allow('').optional(),
});

const couponBodyFields = {
  titles: titleTranslationsSchema.required(),
  code: Joi.string().trim().max(100).required(),
  coupon_type: Joi.string().valid('default', 'free_delivery', 'first_order').default('default'),
  limit: Joi.number().integer().min(1).max(100).allow(null).optional(),
  start_date: Joi.date().required(),
  expire_date: Joi.date().required(),
  discount: Joi.number().min(0).required(),
  discount_type: Joi.string().valid('amount', 'percent', 'percentage').default('amount'),
  max_discount: Joi.number().min(0).default(0),
  min_purchase: Joi.number().min(0).default(0),
};

export const createVendorCouponSchema = Joi.object(couponBodyFields);

export const updateVendorCouponSchema = Joi.object({
  ...couponBodyFields,
  titles: titleTranslationsSchema.required(),
});

export const vendorCouponListQuerySchema = Joi.object({
  search: Joi.string().allow('').optional(),
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).default(0),
});

export const vendorCouponStatusSchema = Joi.object({
  status: Joi.boolean().required(),
});
