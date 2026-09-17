import Joi from 'joi';

export const addToCartSchema = Joi.object({
  user_id: Joi.number().required(),
  item_id: Joi.number().required(),
  is_guest: Joi.boolean().default(false),
  item_type: Joi.string().valid('Food', 'ItemCampaign').default('Food'),
  price: Joi.number().required(),
  quantity: Joi.number().integer().min(1).required(),
  add_on_ids: Joi.array().items(Joi.number()).optional().default([]),
  add_on_qtys: Joi.array().items(Joi.number()).optional().default([]),
  variations: Joi.array().items(Joi.object()).optional().default([]),
  variation_options: Joi.array().items(Joi.object()).optional().default([]),
});

export const updateCartSchema = Joi.object({
  cart_id: Joi.number().required(),
  quantity: Joi.number().integer().min(1).required(),
});
