import Joi from 'joi';

const pagination = {
  limit: Joi.number().integer().min(1).max(100).default(10),
  offset: Joi.number().integer().min(1).default(1),
};

export const vendorMessageListQuerySchema = Joi.object({
  type: Joi.string().valid('customer', 'delivery_man', 'admin').optional(),
  ...pagination,
});

export const vendorMessageSearchQuerySchema = Joi.object({
  name: Joi.string().trim().min(1).required(),
  ...pagination,
});

export const vendorMessageDetailsQuerySchema = Joi.object({
  conversation_id: Joi.number().integer().optional(),
  user_id: Joi.number().integer().optional(),
  delivery_man_id: Joi.number().integer().optional(),
  admin_id: Joi.number().optional(),
  ...pagination,
});

export const vendorMessageSendSchema = Joi.object({
  conversation_id: Joi.number().integer().optional(),
  receiver_type: Joi.string().valid('customer', 'delivery_man', 'admin').optional(),
  receiver_id: Joi.number().integer().optional(),
  message: Joi.string().allow('', null).optional(),
  ...pagination,
}).custom((value, helpers) => {
  if (value.conversation_id == null && !value.receiver_type) {
    return helpers.error('any.custom', {
      message: 'conversation_id or receiver_type is required',
    });
  }
  if (
    value.conversation_id == null &&
    value.receiver_type &&
    value.receiver_type !== 'admin' &&
    value.receiver_id == null
  ) {
    return helpers.error('any.custom', {
      message: 'receiver_id is required for customer or delivery_man',
    });
  }
  return value;
});
