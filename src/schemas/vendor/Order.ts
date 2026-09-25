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
    .valid('confirmed', 'processing', 'handover', 'delivered', 'canceled')
    .required(),
  cancellation_reason: Joi.string().optional().allow(''),
});

export const pollOrdersQuerySchema = Joi.object({
  after_id: Joi.number().integer().min(0).default(0),
});
