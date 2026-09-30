import Joi from 'joi';

export const dmMyOrdersQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(50).default(10),
  /** 1-based page (legacy PHP `offset` query param is the same). */
  offset: Joi.number().integer().min(1).default(1),
  page: Joi.number().integer().min(1).optional(),
  search: Joi.string().trim().max(100).optional().allow(''),
});

export const dmUpdateOrderStatusSchema = Joi.object({
  status: Joi.string()
    .valid('confirmed', 'canceled', 'picked_up', 'delivered', 'handover')
    .required(),
  reason: Joi.string().trim().when('status', {
    is: 'canceled',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
});
