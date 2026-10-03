import Joi from 'joi';

export const consumerOrderListQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(10),
  /** Page number (1-based), same as legacy PHP `offset` query param. */
  offset: Joi.number().integer().min(1).default(1),
  page: Joi.number().integer().min(1).optional(),
  guest_id: Joi.number().integer().optional(),
  search: Joi.string().trim().max(191).optional().allow(''),
});

export type ConsumerOrderListQuery = {
  limit: number;
  offset: number;
  page?: number;
  guest_id?: number;
  search?: string;
};
