//NPM Packages
import Joi from 'joi';

//Schemas
export const consumerRegisterSchema = Joi.object({
  f_name: Joi.string().required().messages({
    'string.empty': 'First name is required',
    'any.required': 'First name is required',
  }),
  l_name: Joi.string().optional().allow(''),
  email: Joi.string().email().optional().messages({
    'string.email': 'Email is invalid',
  }),
  phone: Joi.string().required().messages({
    'string.empty': 'Phone number is required',
    'any.required': 'Phone number is required',
  }),
  password: Joi.string().min(8).required().messages({
    'string.empty': 'Password is required',
    'any.required': 'Password is required',
    'string.min': 'Password must be at least 8 characters long',
  }),
  ref_code: Joi.string().optional().allow('')
});

//Consumer Login Schema
export const consumerLoginSchema = Joi.object({
  login_type: Joi.string().valid('manual', 'otp', 'social').required(),
  
  // For manual login
  email_or_phone: Joi.string().when('login_type', {
    is: 'manual',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  password: Joi.string().min(6).when('login_type', {
    is: 'manual',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  field_type: Joi.string().valid('phone', 'email').when('login_type', {
    is: 'manual',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),

  // For guest cart merging
  guest_id: Joi.number().optional()
});
