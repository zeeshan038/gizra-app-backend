import Joi from 'joi';

const pagination = {
  limit: Joi.number().integer().min(1).max(100).default(10),
  offset: Joi.number().integer().min(1).default(1),
};

export const dmMessageListQuerySchema = Joi.object({
  type: Joi.string().valid('customer', 'vendor').optional(),
  ...pagination,
});

export const dmMessageSearchQuerySchema = Joi.object({
  name: Joi.string().trim().min(1).required(),
  ...pagination,
});

export const dmMessageDetailsQuerySchema = Joi.object({
  conversation_id: Joi.number().integer().optional(),
  user_id: Joi.number().integer().optional(),
  vendor_id: Joi.number().integer().optional(),
  ...pagination,
});

export const dmMessageSendSchema = Joi.object({
  conversation_id: Joi.number().integer().optional(),
  receiver_type: Joi.string().valid('customer', 'vendor').optional(),
  receiver_id: Joi.number().integer().optional(),
  message: Joi.string().allow('', null).optional(),
  ...pagination,
}).custom((value, helpers) => {
  if (value.conversation_id == null && !value.receiver_type) {
    return helpers.error('any.custom', {
      message: 'conversation_id or receiver_type is required',
    });
  }
  if (value.conversation_id == null && value.receiver_type && value.receiver_id == null) {
    return helpers.error('any.custom', {
      message: 'receiver_id is required',
    });
  }
  return value;
});
