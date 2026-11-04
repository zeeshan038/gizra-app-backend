import Joi from 'joi';

export const adminCreateHomeCategorySchema = Joi.object({
  type: Joi.string().valid('category', 'restaurant').optional().default('category'),
  name: Joi.string().trim().min(1).max(100).when('type', {
    is: 'restaurant',
    then: Joi.optional(),
    otherwise: Joi.required(),
  }),
  restaurant_id: Joi.number().integer().positive().when('type', {
    is: 'restaurant',
    then: Joi.required(),
    otherwise: Joi.optional().allow(null),
  }),
  image: Joi.string().trim().max(191).optional().allow('', null),
  priority: Joi.number().integer().min(0).optional().default(0),
  status: Joi.boolean().optional().default(true),
});

export const adminUpdateHomeCategorySchema = Joi.object({
  type: Joi.string().valid('category', 'restaurant').optional(),
  name: Joi.string().trim().min(1).max(100).optional(),
  restaurant_id: Joi.number().integer().positive().optional().allow(null),
  image: Joi.string().trim().max(191).optional().allow('', null),
  priority: Joi.number().integer().min(0).optional(),
  status: Joi.boolean().optional(),
}).min(1);

export const adminAssignHomeCategoryRestaurantsSchema = Joi.object({
  restaurant_ids: Joi.array().items(Joi.number().integer().positive()).required(),
});

export const adminGenerateHomeCategoryImageSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
});
