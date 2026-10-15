import Joi from 'joi';

export const adminCustomerListQuerySchema = Joi.object({
  search: Joi.string().trim().max(200).optional().allow(''),
  filter: Joi.string().valid('all', 'active', 'blocked', 'new').optional().default('all'),
  order_wise: Joi.string()
    .valid('top', 'least', 'latest', 'oldest', 'order_amount')
    .optional(),
  zone_id: Joi.number().integer().optional(),
  order_date_from: Joi.string().isoDate().optional(),
  order_date_to: Joi.string().isoDate().optional(),
  join_date_from: Joi.string().isoDate().optional(),
  join_date_to: Joi.string().isoDate().optional(),
  show_limit: Joi.number().integer().min(1).optional(),
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(1).max(100).optional().default(25),
});

export const adminSubscriberListQuerySchema = Joi.object({
  search: Joi.string().trim().max(200).optional().allow(''),
  filter: Joi.string().valid('oldest', 'latest').optional(),
  join_date_from: Joi.string().isoDate().optional(),
  join_date_to: Joi.string().isoDate().optional(),
  show_limit: Joi.number().integer().min(1).optional(),
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(1).max(100).optional().default(25),
});

export const adminWalletReportQuerySchema = Joi.object({
  from: Joi.string().isoDate().optional(),
  to: Joi.string().isoDate().optional(),
  transaction_type: Joi.string().max(191).optional().allow(''),
  customer_id: Joi.number().integer().optional(),
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(1).max(100).optional().default(25),
});

export const adminAddFundSchema = Joi.object({
  customer_id: Joi.number().integer().required(),
  amount: Joi.number().positive().required(),
  referance: Joi.string().max(191).optional().allow('', null),
});

export const adminWalletBonusCreateSchema = Joi.object({
  title: Joi.string().trim().max(191).required(),
  description: Joi.string().trim().max(500).optional().allow('', null),
  bonus_type: Joi.string().valid('percentage', 'amount').required(),
  bonus_amount: Joi.number().min(0).required(),
  minimum_add_amount: Joi.number().min(0).required(),
  maximum_bonus_amount: Joi.number().min(0).optional(),
  start_date: Joi.string().isoDate().required(),
  end_date: Joi.string().isoDate().required(),
  translations: Joi.object().pattern(Joi.string(), Joi.object({
    title: Joi.string().max(191).optional(),
    description: Joi.string().max(500).optional(),
  })).optional(),
});
