import Joi from 'joi';

export const adminOrdersListQuerySchema = Joi.object({
  status: Joi.string().default('all'),
  search: Joi.string().allow('').optional(),
  limit: Joi.number().integer().min(1).max(100).default(50),
  offset: Joi.number().integer().min(0).default(0),
  manual_only: Joi.boolean().truthy('true', '1').falsy('false', '0').default(false),
  dispatch_status: Joi.string()
    .valid('searching_for_deliverymen', 'on_going')
    .optional()
    .allow(''),
  refund_status: Joi.string().valid('requested', 'refunded', 'rejected').optional().allow(''),
});

export const adminSubscriptionsListQuerySchema = Joi.object({
  search: Joi.string().allow('').optional(),
  limit: Joi.number().integer().min(1).max(100).default(50),
  offset: Joi.number().integer().min(0).default(0),
});

export const assignAdminOrderDeliveryManSchema = Joi.object({
  delivery_man_id: Joi.number().integer().positive().required(),
});
