import Joi from 'joi';

const fieldSchema = Joi.object({
  input_type: Joi.string()
    .valid('string', 'text', 'number', 'date', 'email', 'phone')
    .required(),
  input_name: Joi.string().trim().min(1).max(100).required(),
  placeholder: Joi.string().trim().max(255).allow('').required(),
  is_required: Joi.alternatives()
    .try(Joi.boolean(), Joi.number().integer().valid(0, 1))
    .default(1),
});

export const adminWithdrawMethodListQuerySchema = Joi.object({
  search: Joi.string().trim().max(200).optional().allow(''),
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(1).max(100).optional().default(25),
});

export const adminWithdrawMethodStoreSchema = Joi.object({
  method_name: Joi.string().trim().min(1).max(255).required(),
  is_default: Joi.alternatives()
    .try(Joi.boolean(), Joi.number().integer().valid(0, 1))
    .optional()
    .default(0),
  method_fields: Joi.array().items(fieldSchema).min(1).required(),
});

export const adminWithdrawMethodUpdateSchema = Joi.object({
  method_name: Joi.string().trim().min(1).max(255).required(),
  is_default: Joi.alternatives()
    .try(Joi.boolean(), Joi.number().integer().valid(0, 1))
    .optional()
    .default(0),
  method_fields: Joi.array().items(fieldSchema).min(1).required(),
});

export const adminWithdrawMethodStatusSchema = Joi.object({
  is_active: Joi.number().integer().valid(0, 1).required(),
});

export const adminWithdrawMethodDefaultSchema = Joi.object({
  is_default: Joi.number().integer().valid(0, 1).required(),
});
