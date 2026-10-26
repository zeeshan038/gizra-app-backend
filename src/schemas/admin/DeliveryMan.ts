import Joi from 'joi';

export const adminDeliveryManListQuerySchema = Joi.object({
  search: Joi.string().trim().max(200).optional().allow(''),
  zone_id: Joi.alternatives()
    .try(Joi.number().integer(), Joi.string().valid('all'))
    .optional()
    .default('all'),
  vehicle_id: Joi.alternatives()
    .try(Joi.number().integer(), Joi.string().valid('all'))
    .optional()
    .default('all'),
  job_type: Joi.string().valid('all', 'salary_base', 'freelance').optional().default('all'),
  application_status: Joi.string().valid('approved', 'pending', 'denied').optional().default('approved'),
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(1).max(100).optional().default(15),
});

export const adminDeliveryManJoinQuerySchema = adminDeliveryManListQuerySchema.keys({
  tab: Joi.string().valid('pending', 'denied').optional().default('pending'),
});

export const adminDeliveryManApplicationSchema = Joi.object({
  status: Joi.string().valid('approved', 'denied', 'pending').required(),
});

export const adminDeliveryManStatusSchema = Joi.object({
  status: Joi.boolean().required(),
});

export const adminDeliveryManBonusSchema = Joi.object({
  delivery_man_id: Joi.number().integer().required(),
  amount: Joi.number().positive().required(),
  referance: Joi.string().trim().max(191).optional().allow('', null),
});

export const adminIncentiveDenySchema = Joi.object({
  status: Joi.string().valid('denied').required(),
});

export const adminIncentiveApproveAllSchema = Joi.object({
  incentive_id: Joi.array().items(Joi.number().integer()).min(1).required(),
});

export const adminListQuerySchema = Joi.object({
  search: Joi.string().trim().max(200).optional().allow(''),
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(1).max(100).optional().default(15),
});

export const adminReviewStatusSchema = Joi.object({
  status: Joi.boolean().required(),
});

const identityTypeValues = ['passport', 'driving_license', 'nid', 'restaurant_id'] as const;

export const adminCreateDeliveryManSchema = Joi.object({
  f_name: Joi.string().trim().max(100).required(),
  l_name: Joi.string().trim().max(100).optional().allow('', null),
  email: Joi.string().trim().email().max(100).required(),
  phone: Joi.string().trim().max(20).required(),
  password: Joi.string()
    .min(8)
    .max(100)
    .pattern(/^\S+$/)
    .required()
    .messages({
      'string.pattern.base': 'Password cannot contain spaces',
    }),
  zone_id: Joi.number().integer().required(),
  vehicle_id: Joi.number().integer().required(),
  earning: Joi.boolean().required(),
  identity_type: Joi.string()
    .valid(...identityTypeValues)
    .required(),
  identity_number: Joi.string().trim().max(30).required(),
  image: Joi.string().trim().max(191).optional().allow('', null),
  identity_image: Joi.array().items(Joi.string().trim().max(191)).max(5).optional(),
});

export const adminUpdateDeliveryManSchema = Joi.object({
  f_name: Joi.string().trim().max(100).required(),
  l_name: Joi.string().trim().max(100).optional().allow('', null),
  email: Joi.string().trim().email().max(100).required(),
  phone: Joi.string().trim().max(20).required(),
  password: Joi.string()
    .min(8)
    .max(100)
    .pattern(/^\S+$/)
    .optional()
    .allow('', null)
    .messages({
      'string.pattern.base': 'Password cannot contain spaces',
    }),
  zone_id: Joi.number().integer().required(),
  vehicle_id: Joi.number().integer().required(),
  earning: Joi.boolean().required(),
  identity_type: Joi.string()
    .valid(...identityTypeValues)
    .required(),
  identity_number: Joi.string().trim().max(30).required(),
  image: Joi.string().trim().max(191).optional().allow('', null),
  identity_image: Joi.array().items(Joi.string().trim().max(191)).max(10).optional(),
});

