import Joi from 'joi';

export const vendorLoginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});

export const vendorRegisterSchema = Joi.object({
  f_name: Joi.string().trim().required().messages({
    'string.empty': 'First name is required',
    'any.required': 'First name is required',
  }),
  l_name: Joi.string().trim().required().messages({
    'string.empty': 'Last name is required',
    'any.required': 'Last name is required',
  }),
  email: Joi.string().email().required().messages({
    'string.empty': 'Email is required',
    'any.required': 'Email is required',
    'string.email': 'Email is invalid',
  }),
  phone: Joi.string().trim().required().messages({
    'string.empty': 'Phone number is required',
    'any.required': 'Phone number is required',
  }),
  password: Joi.string().min(6).required().messages({
    'string.empty': 'Password is required',
    'any.required': 'Password is required',
    'string.min': 'Password must be at least 6 characters long',
  }),
  restaurant_name: Joi.string().trim().required().messages({
    'string.empty': 'Restaurant name is required',
    'any.required': 'Restaurant name is required',
  }),
  restaurant_address: Joi.string().trim().required().messages({
    'string.empty': 'Restaurant address is required',
    'any.required': 'Restaurant address is required',
  }),
  lat: Joi.alternatives().try(Joi.string(), Joi.number()).optional(),
  lng: Joi.alternatives().try(Joi.string(), Joi.number()).optional(),
  zone_id: Joi.number().integer().required().messages({
    'any.required': 'Zone ID is required',
  }),
  tax: Joi.number().min(0).required().messages({
    'any.required': 'Vat / Tax is required',
  }),
  language: Joi.string().valid('en', 'he').default('en'),
  cloudflare_id: Joi.string().trim().length(12).hex().optional().allow('', null),
  logo: Joi.string().trim().optional().allow('', null),
  cover_photo: Joi.string().trim().optional().allow('', null),
  cuisines: Joi.array().items(Joi.number().integer()).min(1).optional(),
  minimum_delivery_time: Joi.string().optional(),
  maximum_delivery_time: Joi.string().optional(),
  delivery_time_type: Joi.string().optional(),
});
