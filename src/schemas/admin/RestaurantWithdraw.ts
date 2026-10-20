import Joi from 'joi';

export const adminRestaurantWithdrawListQuerySchema = Joi.object({
  status: Joi.string().valid('all', 'pending', 'approved', 'denied').optional().default('all'),
  search: Joi.string().trim().max(200).optional().allow(''),
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(1).max(100).optional().default(25),
});

export const adminRestaurantWithdrawStatusSchema = Joi.object({
  /** 1 = approve (pay / send), 2 = deny */
  approved: Joi.number().integer().valid(1, 2).required(),
  note: Joi.string().trim().max(500).optional().allow('', null),
});
