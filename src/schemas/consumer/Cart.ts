import Joi from 'joi';

const comboSlotSchema = Joi.object({
  slot_index: Joi.number().integer().min(1).required(),
  slot_label: Joi.string().allow('').optional(),
  variations: Joi.array().items(Joi.object()).optional().default([]),
  variation_options: Joi.array().items(Joi.object()).optional().default([]),
}).unknown(true);

const cartLineFields = {
  item_id: Joi.number().required(),
  item_type: Joi.string().valid('Food', 'ItemCampaign').default('Food'),
  price: Joi.number().required(),
  quantity: Joi.number().integer().min(1).required(),
  add_on_ids: Joi.array().items(Joi.number()).optional().default([]),
  add_on_qtys: Joi.array().items(Joi.number()).optional().default([]),
  add_on_placements: Joi.array()
    .items(Joi.string().valid('whole', 'half_a', 'half_b').insensitive())
    .optional()
    .default([]),
  variations: Joi.array().items(Joi.object()).optional().default([]),
  variation_options: Joi.array().items(Joi.object()).optional().default([]),
  /** Per-slot modifiers for multi-item combos (Burger #1…#N). */
  combo_selections: Joi.array().items(comboSlotSchema).optional().default([]),
};

export const addToCartSchema = Joi.object({
  restaurant_id: Joi.number().required(),
  ...cartLineFields,
  is_guest: Joi.boolean().default(false),
  guest_id: Joi.number().optional().allow(null),
});

export const updateCartSchema = Joi.object({
  cart_id: Joi.alternatives().try(Joi.number(), Joi.string()).required(),
  quantity: Joi.number().integer().required(),
});

const addMultipleLineSchema = Joi.object({
  ...cartLineFields,
  model: Joi.string().valid('Food', 'ItemCampaign').optional(),
});

export const addMultipleCartSchema = Joi.object({
  restaurant_id: Joi.number().required(),
  items: Joi.array().items(addMultipleLineSchema).min(1),
  item_list: Joi.array().items(addMultipleLineSchema).min(1),
  is_guest: Joi.boolean().default(false),
  guest_id: Joi.number().optional().allow(null),
})
  .or('items', 'item_list')
  .custom((value) => {
    if (!value.items?.length && value.item_list?.length) {
      value.items = value.item_list;
    }
    return value;
  });