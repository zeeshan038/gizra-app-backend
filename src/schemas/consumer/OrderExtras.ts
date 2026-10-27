import Joi from 'joi';

export const orderIdQuerySchema = Joi.object({
  order_id: Joi.alternatives(
    Joi.number().integer().positive(),
    Joi.string().pattern(/^\d+$/)
  ).required(),
  guest_id: Joi.number().integer().positive().optional(),
});

export const refundRequestSchema = Joi.object({
  order_id: Joi.alternatives(
    Joi.number().integer().positive(),
    Joi.string().pattern(/^\d+$/)
  ).required(),
  customer_reason: Joi.string().trim().max(254).required(),
  refund_method: Joi.string().trim().max(100).optional().default('wallet'),
  customer_note: Joi.string().trim().max(65535).optional().allow(''),
  image: Joi.array().items(Joi.string()).optional(),
  guest_id: Joi.number().integer().positive().optional(),
});

export const updatePaymentMethodSchema = Joi.object({
  order_id: Joi.alternatives(
    Joi.number().integer().positive(),
    Joi.string().pattern(/^\d+$/)
  ).required(),
  guest_id: Joi.number().integer().positive().optional(),
});

export const offlinePaymentSchema = Joi.object({
  order_id: Joi.number().integer().positive().required(),
  method_id: Joi.number().integer().positive().required(),
  customer_note: Joi.string().trim().optional().allow(''),
}).unknown(true);

export const offlinePaymentUpdateSchema = Joi.object({
  order_id: Joi.number().integer().positive().required(),
  customer_note: Joi.string().trim().optional().allow(''),
}).unknown(true);

export const cancellationReasonsQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(50).default(10),
  offset: Joi.number().integer().min(1).default(1),
  type: Joi.string().optional(),
});

export const foodListSchema = Joi.object({
  food_id: Joi.alternatives(Joi.string(), Joi.array().items(Joi.number())).required(),
});
