import Joi from 'joi';

export const messageListQuerySchema = Joi.object({
  type: Joi.string().valid('vendor', 'delivery_man', 'admin').optional(),
  limit: Joi.number().integer().min(1).max(100).default(10),
  offset: Joi.number().integer().min(1).default(1),
});

export const messageSearchQuerySchema = Joi.object({
  name: Joi.string().trim().min(1).required(),
  type: Joi.string().valid('vendor', 'delivery_man', 'admin').optional(),
  limit: Joi.number().integer().min(1).max(100).default(10),
  offset: Joi.number().integer().min(1).default(1),
});

export const messageDetailsQuerySchema = Joi.object({
  conversation_id: Joi.number().integer().optional(),
  vendor_id: Joi.number().integer().optional(),
  delivery_man_id: Joi.number().integer().optional(),
  admin_id: Joi.number().optional(),
  limit: Joi.number().integer().min(1).max(100).default(10),
  offset: Joi.number().integer().min(1).default(1),
});

export const messageSendSchema = Joi.object({
  conversation_id: Joi.number().integer().optional(),
  receiver_type: Joi.string().valid('vendor', 'delivery_man', 'admin').optional(),
  receiver_id: Joi.number().integer().optional(),
  message: Joi.string().allow('', null).optional(),
  limit: Joi.number().integer().min(1).max(100).default(10),
  offset: Joi.number().integer().min(1).default(1),
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
      message: 'receiver_id is required for vendor or delivery_man',
    });
  }
  return value;
});
