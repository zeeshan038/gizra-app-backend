import Joi from 'joi';

export const consumerReviewsQuerySchema = Joi.object({
  food_id: Joi.number().integer().positive(),
  order_id: Joi.number().integer().positive(),
  delivery_man_id: Joi.number().integer().positive(),
})
  .xor('food_id', 'order_id', 'delivery_man_id')
  .messages({
    'object.missing': 'Provide exactly one of food_id, order_id, or delivery_man_id',
    'object.xor': 'Use only one of food_id, order_id, or delivery_man_id',
  });

export const submitFoodReviewSchema = Joi.object({
  food_id: Joi.number().integer().positive().required(),
  order_id: Joi.number().integer().positive().required(),
  comment: Joi.string().allow('', null).optional(),
  rating: Joi.number().min(1).max(5).required(),
  attachment: Joi.alternatives()
    .try(Joi.array().items(Joi.string()), Joi.string())
    .optional(),
});

export const submitDeliveryManReviewSchema = Joi.object({
  delivery_man_id: Joi.number().integer().positive().required(),
  order_id: Joi.number().integer().positive().required(),
  comment: Joi.string().trim().required(),
  rating: Joi.number().min(1).max(5).required(),
  attachment: Joi.alternatives()
    .try(Joi.array().items(Joi.string()), Joi.string())
    .optional(),
});
