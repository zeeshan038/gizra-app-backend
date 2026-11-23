import Joi from 'joi';

export const createPosApiKeySchema = Joi.object({
  restaurant_id: Joi.number().integer().positive().required(),
  name: Joi.string().trim().max(255).required(),
  provider: Joi.string().trim().max(64).default('generic'),
  environment: Joi.string().valid('sandbox', 'live').default('sandbox'),
  scopes: Joi.array()
    .items(Joi.string().valid('*', 'orders:read', 'orders:write'))
    .min(1)
    .default(['orders:read', 'orders:write']),
});

export const createPosConnectionSchema = Joi.object({
  restaurant_id: Joi.number().integer().positive().required(),
  url: Joi.string().uri({ scheme: ['https', 'http'] }).max(2048).required(),
  provider: Joi.string().trim().max(64).default('generic'),
  external_merchant_id: Joi.string().trim().max(128).optional().allow('', null),
  events: Joi.array()
    .items(Joi.string().valid('order.created', 'order.updated', 'order.cancelled', '*'))
    .min(1)
    .default(['order.created']),
  signing_secret: Joi.string().trim().min(16).max(255).optional(),
  active: Joi.boolean().default(true),
});

export const updatePosConnectionSchema = Joi.object({
  url: Joi.string().uri({ scheme: ['https', 'http'] }).max(2048).optional(),
  provider: Joi.string().trim().max(64).optional(),
  external_merchant_id: Joi.string().trim().max(128).optional().allow('', null),
  events: Joi.array()
    .items(Joi.string().valid('order.created', 'order.updated', 'order.cancelled', '*'))
    .min(1)
    .optional(),
  signing_secret: Joi.string().trim().min(16).max(255).optional(),
  active: Joi.boolean().optional(),
}).min(1);
