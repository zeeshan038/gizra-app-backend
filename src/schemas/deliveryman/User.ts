import Joi from 'joi';

export const dmRegisterSchema = Joi.object({
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
    'string.email': 'Email is invalid',
  }),
  phone: Joi.string().trim().required().messages({
    'string.empty': 'Phone number is required',
  }),
  password: Joi.string().min(6).required().messages({
    'string.min': 'Password must be at least 6 characters long',
  }),
  identity_image: Joi.string().trim().optional().allow('', null),
  confirm_password: Joi.string().valid(Joi.ref('password')).required().messages({
    'any.only': 'Confirm password must match password',
  }),
  zone_id: Joi.number().integer().required().messages({
    'any.required': 'Zone ID is required',
  }),
  identity_type: Joi.string()
    .valid('passport', 'driving_license', 'nid', 'restaurant_id')
    .optional(),
  identity_number: Joi.string().trim().optional().allow(''),
  earning: Joi.boolean().optional(),
});

export const dmLoginSchema = Joi.object({
  phone: Joi.string().required().messages({
    'string.empty': 'Phone is required',
  }),
  password: Joi.string().required().messages({
    'string.empty': 'Password is required',
  }),
});
