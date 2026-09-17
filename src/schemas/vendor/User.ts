import Joi from 'joi';

export const vendorLoginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});

export const vendorRegisterSchema = Joi.object({
  f_name: Joi.string().required().messages({
    'string.empty': 'First name is required',
    'any.required': 'First name is required',
  }),
  l_name: Joi.string().required().messages({
    'string.empty': 'Last name is required',
    'any.required': 'Last name is required',
  }),
  email: Joi.string().email().required().messages({
    'string.empty': 'Email is required',
    'any.required': 'Email is required',
    'string.email': 'Email is invalid',
  }),
  phone: Joi.string().required().messages({
    'string.empty': 'Phone number is required',
    'any.required': 'Phone number is required',
  }),
  password: Joi.string().min(6).required().messages({
    'string.empty': 'Password is required',
    'any.required': 'Password is required',
    'string.min': 'Password must be at least 6 characters long',
  }),
  restaurant_name: Joi.string().required().messages({
    'string.empty': 'Restaurant name is required',
    'any.required': 'Restaurant name is required',
  }),
  restaurant_address: Joi.string().required().messages({
    'string.empty': 'Restaurant address is required',
    'any.required': 'Restaurant address is required',
  }),
  lat: Joi.string().optional(),
  lng: Joi.string().optional(),
  zone_id: Joi.number().required().messages({
    'number.empty': 'Zone ID is required',
    'any.required': 'Zone ID is required',
  }),
  tax: Joi.number().optional().messages({
    'number.empty': 'Tax is required',
    'any.required': 'Tax is required',
  }),
  minimum_delivery_time: Joi.string().optional().messages({
    'string.empty': 'Minimum delivery time is required',
    'any.required': 'Minimum delivery time is required',
  }),
  maximum_delivery_time: Joi.string().optional().messages({
    'string.empty': 'Maximum delivery time is required',
    'any.required': 'Maximum delivery time is required',
  }),
  delivery_time_type: Joi.string().optional(),
});
