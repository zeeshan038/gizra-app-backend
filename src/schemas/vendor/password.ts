import Joi from 'joi';

const resetIdentitySchema = {
  field_type: Joi.string().valid('email', 'phone').default('phone'),
  email: Joi.string()
    .email()
    .when('field_type', { is: 'email', then: Joi.required(), otherwise: Joi.forbidden() }),
  phone: Joi.string().when('field_type', {
    is: 'phone',
    then: Joi.required(),
    otherwise: Joi.forbidden(),
  }),
};

export const vendorChangePasswordSchema = Joi.object({
  current_password: Joi.string().required(),
  password: Joi.string().min(6).required(),
  confirm_password: Joi.string().valid(Joi.ref('password')).required().messages({
    'any.only': 'Confirm password must match password',
  }),
});

export const vendorForgotPasswordSchema = Joi.object({
  ...resetIdentitySchema,
});

export const vendorVerifyPasswordOtpSchema = Joi.object({
  ...resetIdentitySchema,
  otp: Joi.string().required(),
});

export const vendorResetPasswordSchema = Joi.object({
  ...resetIdentitySchema,
  otp: Joi.string().required(),
  password: Joi.string().min(6).required(),
  confirm_password: Joi.string().valid(Joi.ref('password')).required().messages({
    'any.only': 'Confirm password must match password',
  }),
});
