import Joi from 'joi';

export const dmWalletWithdrawRequestSchema = Joi.object({
  amount: Joi.number().positive().required(),
  id: Joi.number().integer().positive().required(),
}).unknown(true);

export const dmWalletListQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(25),
  offset: Joi.number().integer().min(1).default(1),
  page: Joi.number().integer().min(1).optional(),
  search: Joi.string().trim().allow('').optional(),
});
