import Joi from 'joi';

const coordinatePair = Joi.array()
  .ordered(Joi.number().required(), Joi.number().required())
  .length(2);

export const adminCreateZoneSchema = Joi.object({
  name: Joi.string().trim().max(191).required(),
  display_name: Joi.string().trim().max(255).optional().allow('', null),
  status: Joi.boolean().default(true),
  coordinates: Joi.array().items(coordinatePair).min(3).required(),
  per_km_shipping_charge: Joi.number().min(0).optional(),
  minimum_shipping_charge: Joi.number().min(0).optional(),
  maximum_shipping_charge: Joi.number().min(0).optional().allow(null),
  max_cod_order_amount: Joi.number().min(0).optional().allow(null),
  increased_delivery_fee: Joi.number().min(0).optional(),
  increased_delivery_fee_status: Joi.boolean().optional(),
  increase_delivery_charge_message: Joi.string().max(255).optional().allow('', null),
});

export const adminUpdateZoneSchema = Joi.object({
  name: Joi.string().trim().max(191).optional(),
  display_name: Joi.string().trim().max(255).optional().allow('', null),
  status: Joi.boolean().optional(),
  coordinates: Joi.array().items(coordinatePair).min(3).optional(),
  per_km_shipping_charge: Joi.number().min(0).optional(),
  minimum_shipping_charge: Joi.number().min(0).optional(),
  maximum_shipping_charge: Joi.number().min(0).optional().allow(null),
  max_cod_order_amount: Joi.number().min(0).optional().allow(null),
  increased_delivery_fee: Joi.number().min(0).optional(),
  increased_delivery_fee_status: Joi.boolean().optional(),
  increase_delivery_charge_message: Joi.string().max(255).optional().allow('', null),
}).min(1);

export const adminAssignRestaurantZoneSchema = Joi.object({
  zone_id: Joi.number().integer().required(),
});
