import Joi from 'joi';

export const adminCollectCashSchema = Joi.object({
  type: Joi.string().valid('restaurant', 'deliveryman').required(),
  restaurant_id: Joi.number().integer().when('type', {
    is: 'restaurant',
    then: Joi.required(),
    otherwise: Joi.forbidden(),
  }),
  deliveryman_id: Joi.number().integer().when('type', {
    is: 'deliveryman',
    then: Joi.required(),
    otherwise: Joi.forbidden(),
  }),
  amount: Joi.number().positive().required(),
  method: Joi.string().trim().max(191).required(),
  ref: Joi.string().trim().max(191).allow('', null).optional(),
});

export const adminCollectCashAccountsQuerySchema = Joi.object({
  type: Joi.string().valid('restaurant', 'deliveryman').required(),
  search: Joi.string().trim().max(200).allow('').optional(),
});

export const adminCollectCashAccountDataQuerySchema = Joi.object({
  type: Joi.string().valid('restaurant', 'deliveryman').required(),
  id: Joi.number().integer().required(),
});

export const adminCollectCashListQuerySchema = Joi.object({
  search: Joi.string().trim().max(200).allow('').optional(),
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(1).max(100).optional().default(25),
});
