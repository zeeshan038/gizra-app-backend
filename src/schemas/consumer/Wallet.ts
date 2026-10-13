import Joi from 'joi';

export const walletTransactionsQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(50).default(10),
  offset: Joi.number().integer().min(1).default(1),
  type: Joi.string()
    .valid('order', 'loyalty_point', 'add_fund', 'referrer', 'CashBack')
    .optional(),
});

export const walletAddFundSchema = Joi.object({
  amount: Joi.number().min(0.001).required(),
  payment_method: Joi.string().valid('hyper_pay').default('hyper_pay'),
  callback: Joi.string().trim().required(),
  payment_platform: Joi.string().valid('app', 'web').default('app'),
});

export const loyaltyTransferSchema = Joi.object({
  point: Joi.number().integer().min(1).required(),
  reference: Joi.string().optional().allow(''),
});

export const loyaltyTransactionsQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(50).default(10),
  offset: Joi.number().integer().min(1).default(1),
});

export const cashbackAmountQuerySchema = Joi.object({
  amount: Joi.number().min(0).required(),
  customer_id: Joi.alternatives(Joi.number(), Joi.string()).optional(),
});
