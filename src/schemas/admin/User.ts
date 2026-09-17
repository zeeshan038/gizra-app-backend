import Joi from 'joi';

export const adminLoginSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.empty': 'Email is required',
    'any.required': 'Email is required',
    'string.email': 'Email is invalid',
  }),
  password: Joi.string().required().messages({
    'string.empty': 'Password is required',
    'any.required': 'Password is required',
  }),
});
