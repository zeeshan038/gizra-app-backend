import Joi from 'joi';

export const vendorReviewListQuerySchema = Joi.object({
  search: Joi.string().allow('').optional(),
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).default(0),
});

export const vendorReviewReplySchema = Joi.object({
  reply: Joi.string().trim().max(255).required(),
});
