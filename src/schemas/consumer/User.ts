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
  guest_id: Joi.number().optional(),

  // For social login (PHP POST /auth/login login_type=social)
  token: Joi.string().when('login_type', {
    is: 'social',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  unique_id: Joi.string().when('login_type', {
    is: 'social',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  email: Joi.string().email().when('login_type', {
    is: 'social',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  medium: Joi.string().valid('google', 'facebook', 'apple').when('login_type', {
    is: 'social',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  access_token: Joi.alternatives().try(Joi.number(), Joi.boolean()).optional(),
  verified: Joi.string().valid('default', 'no').optional(),
});

/** Dedicated Google sign-in (same flow as login_type=social + medium=google). */
export const consumerGoogleSignInSchema = Joi.object({
  token: Joi.string().required().messages({
    'any.required': 'Google token is required',
  }),
  email: Joi.string().email().required().messages({
    'any.required': 'Email is required',
  }),
  unique_id: Joi.string().required().messages({
    'any.required': 'unique_id is required',
  }),
  access_token: Joi.alternatives().try(Joi.number(), Joi.boolean()).optional(),
  guest_id: Joi.number().optional(),
  verified: Joi.string().valid('default', 'no').default('default'),
});

/** Customer app — Restaurant Registration screen (Figma); owner from Bearer profile */
export const consumerApplyRestaurantSchema = Joi.object({
  restaurant_name: Joi.string().trim().required().messages({
    'any.required': 'Restaurant name is required',
  }),
  restaurant_address: Joi.string().trim().required().messages({
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
});

/** Customer app — Delivery Man Registration screen (Figma); phone OTP instead of confirm password */
export const consumerApplyDeliveryManSchema = Joi.object({
  f_name: Joi.string().trim().required(),
  l_name: Joi.string().trim().required(),
  phone: Joi.string().trim().required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  cloudflare_id: Joi.string().trim().length(12).hex().optional().allow('', null),
  identity_image: Joi.string().trim().optional().allow('', null),
  image: Joi.string().trim().optional().allow('', null),
  otp: Joi.string().length(6).required().messages({
    'any.required': 'OTP is required',
    'string.length': 'OTP must be 6 digits',
  }),
  zone_id: Joi.number().integer().optional(),
});
