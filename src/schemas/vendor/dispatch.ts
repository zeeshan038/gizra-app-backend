import Joi from 'joi';

export const vendorRequestDriverSchema = Joi.object({
  customer_name: Joi.string().trim().max(100).required(),
  customer_phone: Joi.string().trim().max(30).required(),
  address: Joi.string().trim().max(1000).required(),
  order_amount: Joi.number().min(0.01).required(),
  delivery_fee: Joi.number().min(0).required(),
  payment_method: Joi.string().valid('prepaid', 'cash_on_delivery').optional(),
  idempotency_key: Joi.string().trim().max(100).required(),
  zone_id: Joi.number().integer().optional(),
  latitude: Joi.number().optional(),
  longitude: Joi.number().optional(),
  tax: Joi.number().min(0).optional(),
  /** Restaurant's own ticket / receipt number from their POS or legacy system */
  restaurant_order_ref: Joi.string().trim().max(100).optional().allow(''),
  restaurant_order_number: Joi.string().trim().max(100).optional().allow(''),
  pos_order_number: Joi.string().trim().max(100).optional().allow(''),
  pos_order_id: Joi.string().trim().max(100).optional().allow(''),
  external_order_id: Joi.string().trim().max(100).optional().allow(''),
});
