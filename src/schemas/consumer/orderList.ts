import Joi from 'joi';

export const consumerOrderListQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).required(),
  offset: Joi.number().integer().min(1).required(),
  guest_id: Joi.number().integer().optional(),
  search: Joi.string().trim().max(191).optional().allow(''),
});

export type ConsumerOrderListQuery = {
  limit: number;
  offset: number;
  guest_id?: number;
  search?: string;
};
