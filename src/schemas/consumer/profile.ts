import Joi from 'joi';

export const updateProfileSchema = Joi.object({
  name: Joi.string().trim().optional(),
  f_name: Joi.string().trim().optional(),
  l_name: Joi.string().trim().optional().allow(''),
  email: Joi.string().email().optional().allow('', null),
  phone: Joi.string().optional().allow('', null),
  image: Joi.string().trim().optional().allow('', null),
  current_language_key: Joi.string().trim().max(10).optional(),
  zone_id: Joi.number().integer().positive().optional(),
}).min(1);

export const firebaseTokenSchema = Joi.object({
  cm_firebase_token: Joi.string().required(),
});

export const updateInterestSchema = Joi.object({
  interest: Joi.array().items(Joi.number().integer()).min(1).required(),
});
