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
