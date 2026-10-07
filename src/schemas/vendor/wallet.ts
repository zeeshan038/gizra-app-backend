import Joi from 'joi';

export const vendorWithdrawMethodListQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(25),
  offset: Joi.number().integer().min(1).default(1),
  search: Joi.string().trim().allow('').optional(),
});

export const vendorWithdrawMethodStoreSchema = Joi.object({
  withdraw_method_id: Joi.number().integer().positive().required(),
}).unknown(true);

export const vendorWithdrawMethodDefaultSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  is_default: Joi.number().integer().valid(0, 1).required(),
});

export const vendorWalletPaymentListQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(25),
  offset: Joi.number().integer().min(1).default(1),
  search: Joi.string().trim().allow('').optional(),
});

export const vendorWalletWithdrawRequestSchema = Joi.object({
  amount: Joi.number().positive().required(),
  id: Joi.number().integer().positive().required(),
}).unknown(true);
