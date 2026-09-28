import Joi from 'joi';
import { ORDER_LIST_STATUSES } from '../../utils/vendor/order/query';

export const orderListQuerySchema = Joi.object({
  status: Joi.string()
    .valid(...ORDER_LIST_STATUSES)
    .default('all'),
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).default(0),
  search: Joi.string().optional().allow(''),
});

export const updateOrderStatusSchema = Joi.object({
  status: Joi.string()
    .valid('confirmed', 'accepted', 'processing', 'handover', 'delivered', 'canceled')
    .required(),
  cancellation_reason: Joi.string().optional().allow(''),
});

export const pollOrdersQuerySchema = Joi.object({
  after_id: Joi.number().integer().min(0).default(0),
});

export const posOrderHistoryQuerySchema = Joi.object({
  source: Joi.string().valid('online', 'manual').default('online'),
  status: Joi.string()
    .valid('all', 'delivered', 'refunded', 'canceled', 'failed', 'pending', 'handover')
    .default('all'),
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).default(0),
  search: Joi.string().optional().allow(''),
  include_summary: Joi.alternatives()
    .try(Joi.boolean(), Joi.string().valid('true', 'false', '1', '0'))
    .default(true),
});
