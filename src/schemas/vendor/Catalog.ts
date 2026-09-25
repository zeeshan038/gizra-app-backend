import Joi from 'joi';

export const createCategorySchema = Joi.object({
  name: Joi.string().required(),
  image: Joi.string().allow('').optional(),
  parent_id: Joi.number().optional().allow(null),
});

export const createFoodSchema = Joi.object({
  name: Joi.string().required(),
  description: Joi.string().allow('').optional().default(''),
  image: Joi.string().optional(),
  category_id: Joi.number().required(),
  price: Joi.number().required(),
  restaurant_id: Joi.number().required(),
  variations: Joi.array().items(Joi.object()).optional().default([]),
  add_ons: Joi.array().items(Joi.number()).optional().default([]),
  status: Joi.boolean().optional().default(true),
  is_draft: Joi.number().optional().default(0),
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
