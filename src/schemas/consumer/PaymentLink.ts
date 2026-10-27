import Joi from 'joi';

export const generatePaymentLinkSchema = Joi.object({
  /** Existing flow: pay for an order already created via POST /consumer/order/place */
  order_id: Joi.alternatives().try(Joi.number().integer().positive(), Joi.string().trim()).optional(),
  payment_method: Joi.string().trim().required(),
  callback: Joi.string().trim().min(1).required(),
  payment_platform: Joi.string().valid('app', 'web').default('app'),
});
