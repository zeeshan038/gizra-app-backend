import Joi from 'joi';

export const posRejectSchema = Joi.object({
  reason: Joi.string().trim().max(500).optional().allow(''),
  cancellation_reason: Joi.string().trim().max(500).optional().allow(''),
});

export const posListOrdersQuerySchema = Joi.object({
  status: Joi.string().trim().max(40).optional().allow(''),
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).default(0),
  updated_since: Joi.date().iso().optional(),
});

export const posOrderIdParamSchema = Joi.object({
  id: Joi.alternatives()
    .try(Joi.number().integer().positive(), Joi.string().trim().pattern(/^\d+$/))
    .required(),
});
