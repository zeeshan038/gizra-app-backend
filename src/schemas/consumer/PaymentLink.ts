import Joi from 'joi';

export const generatePaymentLinkSchema = Joi.object({
  order_id: Joi.alternatives().try(Joi.number().integer().positive(), Joi.string().trim()).required(),
  payment_method: Joi.string().trim().required(),
  callback: Joi.string().trim().min(1).required(),
  payment_platform: Joi.string().valid('app', 'web').default('app'),
});
