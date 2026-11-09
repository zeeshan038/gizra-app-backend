import Joi from 'joi';

export const createCategorySchema = Joi.object({
  name: Joi.string().required(),
  image: Joi.string().allow('').optional(),
  parent_id: Joi.number().optional().allow(null),
});

export const updateCategorySchema = Joi.object({
  name: Joi.string().optional(),
  image: Joi.string().allow('').optional(),
});

export const catalogReorderSchema = Joi.object({
  ordered_ids: Joi.array().items(Joi.number().integer().positive()).min(1).max(5000).required(),
  category_id: Joi.number().integer().positive().optional(),
});

/** Menu item drag order — full menu (All Items) or one category block. */
export const foodReorderSchema = Joi.object({
  ordered_ids: Joi.array().items(Joi.number().integer().positive()).min(1).max(5000).required(),
  category_id: Joi.number().integer().positive().optional(),
});

export const createFoodSchema = Joi.object({
  name: Joi.string().required(),
  description: Joi.string().allow('').optional().default(''),
  image: Joi.string().optional(),
  category_id: Joi.number().required(),
  price: Joi.number().required(),
  restaurant_id: Joi.number().required(),
  variations: Joi.array().items(Joi.object()).optional().default([]),
  add_ons: Joi.array()
    .items(
      Joi.alternatives().try(
        Joi.number(),
        Joi.object({
          id: Joi.number().optional(),
          name: Joi.string().required(),
          price: Joi.number().required().min(0),
        })
      )
    )
    .optional()
    .default([]),
  status: Joi.boolean().optional().default(true),
  is_draft: Joi.number().optional().default(0),
  discount: Joi.number().min(0).optional().default(0),
  discount_type: Joi.string().valid('percent', 'amount').optional().default('percent'),
  stock_type: Joi.string().valid('unlimited', 'limited').optional().default('unlimited'),
  item_stock: Joi.number().integer().min(0).optional().default(0),
  available_time_starts: Joi.string().allow('', null).optional(),
  available_time_ends: Joi.string().allow('', null).optional(),
  veg: Joi.boolean().optional().default(false),
});

const foodAddOnsSchema = Joi.array()
  .items(
    Joi.alternatives().try(
      Joi.number(),
      Joi.object({
        id: Joi.number().optional(),
        name: Joi.string().required(),
        price: Joi.number().required().min(0),
      })
    )
  )
  .optional();

/** PATCH — no defaults; omitted keys must not overwrite existing DB values. */
export const updateFoodSchema = Joi.object({
  name: Joi.string().optional(),
  description: Joi.string().allow('').optional(),
  image: Joi.string().optional(),
  category_id: Joi.number().optional(),
  price: Joi.number().optional(),
  restaurant_id: Joi.number().optional(),
  variations: Joi.array().items(Joi.object()).optional(),
  add_ons: foodAddOnsSchema,
  status: Joi.boolean().optional(),
  is_draft: Joi.number().optional(),
  discount: Joi.number().min(0).optional(),
  discount_type: Joi.string().valid('percent', 'amount').optional(),
  stock_type: Joi.string().valid('unlimited', 'limited').optional(),
  item_stock: Joi.number().integer().min(0).optional(),
  available_time_starts: Joi.string().allow('', null).optional(),
  available_time_ends: Joi.string().allow('', null).optional(),
  veg: Joi.boolean().optional(),
});

export const aiTextSchema = Joi.object({
  name: Joi.string().required().messages({
    'string.empty': 'Item name is required',
    'any.required': 'Item name is required',
  })
});

export const aiPdfSchema = Joi.object({
  fileBase64: Joi.string().required(),
  mimeType: Joi.string().required()
});
