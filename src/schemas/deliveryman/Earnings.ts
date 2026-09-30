import Joi from 'joi';

export const dmEarningsQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(50).default(15),
  offset: Joi.number().integer().min(1).default(1),
  page: Joi.number().integer().min(1).optional(),
  search: Joi.string().trim().max(100).optional().allow(''),
  /** When true, response includes only `summary` (no history pagination). */
  summary_only: Joi.boolean().optional(),
});
