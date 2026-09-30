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
  phone: Joi.string().trim().min(9).required().messages({
    'string.empty': 'Phone number is required',
    'string.min': 'Phone number is too short',
  }),
  password: Joi.string().min(6).required().messages({
    'string.min': 'Password must be at least 6 characters long',
  }),
  confirm_password: Joi.string().valid(Joi.ref('password')).required().messages({
    'any.only': 'Confirm password must match password',
  }),
  cloudflare_id: Joi.string().trim().length(12).hex().optional().allow('', null),
  /** Step 1 — portrait / identity photo (upload path from POST /upload category=profile). */
  image: Joi.string().trim().required().messages({
    'string.empty': 'Identity image is required',
    'any.required': 'Identity image is required',
  }),
  /** Step 2 — ID document photo(s); 1–2 paths from POST /upload category=identity. */
  identity_image: Joi.alternatives()
    .try(
      Joi.string().trim().min(1),
      Joi.array().items(Joi.string().trim().min(1)).min(1).max(5)
    )
    .required()
    .messages({
      'any.required': 'ID document image is required',
      'alternatives.match': 'ID document image is required',
    }),
  /** Figma “Select City” — service zone (alias `city_id` accepted in controller normalizer). */
  zone_id: Joi.number().integer().required().messages({
    'any.required': 'City / zone is required',
  }),
  identity_type: Joi.string()
    .valid('passport', 'driving_license', 'nid')
    .required()
    .messages({
      'any.required': 'ID type is required',
      'any.only': 'Invalid ID type',
    }),
  identity_number: Joi.string().trim().required().messages({
    'string.empty': 'ID number is required',
    'any.required': 'ID number is required',
  }),
  /** Figma “Select Delivery Type” — commission/freelance vs salary (alias `delivery_type`). */
  earning: Joi.boolean().optional(),
  delivery_type: Joi.string().valid('commission', 'salary', 'freelance').optional(),
  vehicle_id: Joi.number().integer().optional().allow(null),
})
  .or('earning', 'delivery_type')
  .messages({
    'object.missing': 'Delivery type is required',
  });

export const dmLoginSchema = Joi.object({
  phone: Joi.string().trim().min(9).required().messages({
    'string.empty': 'Phone is required',
    'string.min': 'Phone is required',
  }),
  password: Joi.string().required().messages({
    'string.empty': 'Password is required',
  }),
  remember_me: Joi.boolean().optional(),
});

/** Figma reset screen — phone only (+972…). */
export const dmForgotPasswordSchema = Joi.object({
  phone: Joi.string().trim().min(9).required().messages({
    'string.empty': 'Phone number is required',
    'any.required': 'Phone number is required',
  }),
});

/** Figma OTP screen — 4 digits (6 accepted for legacy). */
export const dmVerifyPasswordOtpSchema = Joi.object({
  phone: Joi.string().trim().min(9).required(),
  otp: Joi.string()
    .pattern(/^\d{4,6}$/)
    .required()
    .messages({
      'string.pattern.base': 'OTP must be 4–6 digits',
    }),
});

/** Figma create-new-password screen. */
export const dmResetPasswordSchema = Joi.object({
  phone: Joi.string().trim().min(9).required(),
  otp: Joi.string()
    .pattern(/^\d{4,6}$/)
    .required(),
  password: Joi.string().min(6).required(),
  confirm_password: Joi.string().valid(Joi.ref('password')).required().messages({
    'any.only': 'Confirm password must match password',
  }),
});

export const dmChangePasswordSchema = Joi.object({
  current_password: Joi.string().required(),
  password: Joi.string().min(6).required(),
  confirm_password: Joi.string().valid(Joi.ref('password')).required().messages({
    'any.only': 'Confirm password must match password',
  }),
});

