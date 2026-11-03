import Joi from 'joi';

export const adminReportListQuerySchema = Joi.object({
  from: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional(),
  zone_id: Joi.alternatives()
    .try(Joi.number().integer(), Joi.string().pattern(/^\d+$/), Joi.string().valid('all'))
    .optional(),
  restaurant_id: Joi.alternatives()
    .try(Joi.number().integer(), Joi.string().pattern(/^\d+$/), Joi.string().valid('all'))
    .optional(),
  customer_id: Joi.alternatives()
    .try(Joi.number().integer(), Joi.string().pattern(/^\d+$/), Joi.string().valid('all'))
    .optional(),
  delivery_man_id: Joi.alternatives()
    .try(Joi.number().integer(), Joi.string().pattern(/^\d+$/), Joi.string().valid('all'))
    .optional(),
  campaign_id: Joi.alternatives()
    .try(Joi.number().integer(), Joi.string().pattern(/^\d+$/), Joi.string().valid('all'))
    .optional(),
  expense_type: Joi.string().max(191).optional().allow('', 'all'),
  status: Joi.string().max(50).optional().allow('', 'all'),
  payment_method_id: Joi.alternatives().try(Joi.number().integer(), Joi.string().valid('all')).optional(),
  transaction_type: Joi.string().max(191).optional().allow(''),
  search: Joi.string().max(191).optional().allow(''),
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(1).max(100).optional().default(25),
});

export const adminCustomerWalletReportQuerySchema = Joi.object({
  from: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional(),
  transaction_type: Joi.string().max(191).optional().allow(''),
  customer_id: Joi.number().integer().optional(),
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(1).max(100).optional().default(25),
});
