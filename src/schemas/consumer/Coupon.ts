import Joi from 'joi';

export const couponApplyQuerySchema = Joi.object({
  code: Joi.string().required(),
  restaurant_id: Joi.number().integer().positive().required(),
});

export const couponListQuerySchema = Joi.object({
  restaurant_id: Joi.number().integer().positive().optional(),
});

export const restaurantWiseCouponQuerySchema = Joi.object({
  restaurant_id: Joi.number().integer().positive().required(),
});
