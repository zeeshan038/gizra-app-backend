import Joi from 'joi';

export const dmRegisterSchema = Joi.object({
  fName: Joi.string().required().messages({
    'string.empty': 'First name is required',
    'any.required': 'First name is required',
  }),
  lName: Joi.string().required().messages({
    'string.empty': 'Last name is required',
    'any.required': 'Last name is required',
  }),
  email: Joi.string().email().optional().messages({
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
  identity_type: Joi.string().valid('passport', 'driving_license', 'nid', 'restaurant_id').required(),
  identity_number: Joi.string().required(),
  earning: Joi.boolean().required(),
  zone_id: Joi.number().required(),
  earning_type: Joi.string().valid('freelance', 'salary').optional(), // Assuming it might be used
});

export const dmLoginSchema = Joi.object({
  phone: Joi.string().required().messages({
    'string.empty': 'Phone is required',
    'any.required': 'Phone is required',
  }),
  password: Joi.string().required().messages({
    'string.empty': 'Password is required',
    'any.required': 'Password is required',
  }),
});
