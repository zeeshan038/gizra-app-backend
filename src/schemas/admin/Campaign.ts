import Joi from 'joi';

export const adminCampaignListQuerySchema = Joi.object({
  type: Joi.string().valid('basic', 'food').required(),
  search: Joi.string().trim().max(200).optional().allow(''),
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(1).max(100).optional().default(25),
});

const dateField = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/);
const timeField = Joi.string().pattern(/^\d{2}:\d{2}(:\d{2})?$/);

export const adminBasicCampaignCreateSchema = Joi.object({
  title: Joi.string().trim().max(191).required(),
  description: Joi.string().trim().max(1000).optional().allow('', null),
  image: Joi.string().trim().max(191).required(),
  start_date: dateField.required(),
  end_date: dateField.required(),
  start_time: timeField.required(),
  end_time: timeField.required(),
  translations: Joi.object().pattern(Joi.string(), Joi.object({
    title: Joi.string().max(191).optional(),
    description: Joi.string().max(1000).optional(),
  })).optional(),
});

export const adminFoodCampaignCreateSchema = Joi.object({
  title: Joi.string().trim().max(191).required(),
  description: Joi.string().trim().max(1000).optional().allow('', null),
  image: Joi.string().trim().max(191).required(),
  restaurant_id: Joi.number().integer().required(),
  category_id: Joi.number().integer().required(),
  sub_category_id: Joi.number().integer().optional(),
  sub_sub_category_id: Joi.number().integer().optional(),
  price: Joi.number().positive().required(),
  discount: Joi.number().min(0).default(0),
  discount_type: Joi.string().valid('percent', 'amount').default('percent'),
  tax: Joi.number().min(0).default(0),
  tax_type: Joi.string().valid('percent', 'amount').default('percent'),
  veg: Joi.boolean().required(),
  start_date: dateField.required(),
  end_date: dateField.required(),
  start_time: timeField.required(),
  end_time: timeField.required(),
});
