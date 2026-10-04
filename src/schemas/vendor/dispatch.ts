import Joi from 'joi';

export const vendorRequestDriverSchema = Joi.object({
  customer_name: Joi.string().trim().max(100).required(),
  customer_phone: Joi.string().trim().max(30).required(),
  address: Joi.string().trim().max(1000).required(),
  order_amount: Joi.number().min(0.01).required(),
  delivery_fee: Joi.number().min(0).required(),
  payment_method: Joi.string().valid('prepaid', 'cash_on_delivery').required(),
  idempotency_key: Joi.string().trim().max(100).required(),
  zone_id: Joi.number().integer().optional(),
  latitude: Joi.number().optional(),
  longitude: Joi.number().optional(),
  tax: Joi.number().min(0).optional(),
});
