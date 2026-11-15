import Joi from 'joi';

export const couponApplyQuerySchema = Joi.object({
  code: Joi.string().trim().required(),
  restaurant_id: Joi.number().integer().positive().required(),
  order_amount: Joi.number().min(0).optional(),
});

export const couponListQuerySchema = Joi.object({
  restaurant_id: Joi.number().integer().positive().optional(),
});

export const restaurantWiseCouponQuerySchema = Joi.object({
  restaurant_id: Joi.number().integer().positive().required(),
});
