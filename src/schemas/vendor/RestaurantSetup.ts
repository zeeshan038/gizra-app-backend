import Joi from 'joi';
import { RESTAURANT_TOGGLE_KEYS } from '../../types/vendor/restaurantSetup';

export const restaurantToggleSchema = Joi.object({
  key: Joi.string()
    .valid(...RESTAURANT_TOGGLE_KEYS)
    .required(),
  status: Joi.boolean().required(),
});

export const restaurantActiveSchema = Joi.object({
  closed: Joi.boolean().required(),
});

export const restaurantSetupSchema = Joi.object({
  minimum_order: Joi.number().min(0).max(100000).required(),
  gst_status: Joi.boolean().required(),
  gst_code: Joi.string().allow('').max(191).default(''),
  cuisine_ids: Joi.array().items(Joi.number().integer().positive()).default([]),
  tags: Joi.array().items(Joi.string().trim().max(255)).default([]),
  characteristics: Joi.array().items(Joi.string().trim().max(255)).max(5).default([]),
  customer_order_date: Joi.number().integer().min(0).max(99999999).optional(),
  extra_packaging_status: Joi.boolean().optional(),
  extra_packaging_amount: Joi.number().min(0).max(100000).allow(null).optional(),
  minimum_delivery_charge: Joi.number().min(0).optional(),
  per_km_delivery_charge: Joi.number().min(0).optional(),
  maximum_shipping_charge: Joi.number().min(0).allow(null).optional(),
  free_delivery_distance_status: Joi.boolean().optional(),
  free_delivery_distance: Joi.string().allow('').max(255).optional(),
  schedule_advance_dine_in_booking_duration: Joi.number().integer().min(0).max(9999).optional(),
  schedule_advance_dine_in_booking_duration_time_format: Joi.string()
    .valid('min', 'hour', 'day')
    .optional(),
});

export const restaurantMetaSchema = Joi.object({
  meta_title: Joi.string().trim().max(100).required(),
  meta_description: Joi.string().trim().required(),
  meta_image: Joi.string().allow('', null).optional(),
  translations: Joi.array()
    .items(
      Joi.object({
        locale: Joi.string().trim().max(10).required(),
        meta_title: Joi.string().allow('').max(100).default(''),
        meta_description: Joi.string().allow('').default(''),
      })
    )
    .default([]),
});

export const restaurantScheduleSchema = Joi.object({
  day: Joi.number().integer().min(0).max(6).required(),
  start_time: Joi.string()
    .pattern(/^\d{2}:\d{2}$/)
    .required(),
  end_time: Joi.string()
    .pattern(/^\d{2}:\d{2}$/)
    .required(),
});
