import Joi from 'joi';

export const adminDeliveryManPaymentListQuerySchema = Joi.object({
  search: Joi.string().trim().max(200).allow('').optional(),
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(1).max(100).optional().default(25),
});

export const adminDeliveryManPaymentCreateSchema = Joi.object({
  delivery_man_id: Joi.number().integer().positive().required(),
  amount: Joi.number().positive().max(999999999999.99).required(),
  method: Joi.string().trim().max(191).required(),
  ref: Joi.string().trim().max(191).allow('', null).optional(),
});
