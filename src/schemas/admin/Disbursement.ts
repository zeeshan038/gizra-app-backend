import Joi from 'joi';

export const adminDisbursementListQuerySchema = Joi.object({
  status: Joi.string()
    .valid('all', 'pending', 'completed', 'partially_completed', 'canceled')
    .optional()
    .default('all'),
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(1).max(100).optional().default(15),
});

export const adminDisbursementDetailQuerySchema = Joi.object({
  search: Joi.string().trim().max(200).optional().allow(''),
  restaurant_id: Joi.alternatives()
    .try(Joi.number().integer(), Joi.string().valid('all'))
    .optional()
    .default('all'),
  delivery_man_id: Joi.alternatives()
    .try(Joi.number().integer(), Joi.string().valid('all'))
    .optional()
    .default('all'),
  payment_method_id: Joi.alternatives()
    .try(Joi.number().integer(), Joi.string().valid('all'))
    .optional()
    .default('all'),
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(1).max(100).optional().default(15),
});

export const adminDisbursementDetailStatusSchema = Joi.object({
  status: Joi.string().valid('pending', 'completed', 'canceled').required(),
});

export const adminRestaurantDisbursementBulkStatusSchema = Joi.object({
  disbursement_id: Joi.number().integer().required(),
  restaurant_ids: Joi.array().items(Joi.number().integer()).min(1).required(),
  status: Joi.string().valid('pending', 'completed', 'canceled').required(),
});

export const adminDmDisbursementBulkStatusSchema = Joi.object({
  disbursement_id: Joi.number().integer().required(),
  delivery_man_ids: Joi.array().items(Joi.number().integer()).min(1).required(),
  status: Joi.string().valid('pending', 'completed', 'canceled').required(),
});
