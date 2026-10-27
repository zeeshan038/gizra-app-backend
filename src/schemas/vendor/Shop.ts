import Joi from 'joi';

const phonePattern = /^[0-9+\-\s()]+$/;

export const shopUpdateSchema = Joi.object({
  name: Joi.string().trim().max(191).required(),
  address: Joi.string().trim().max(1000).allow('').required(),
  phone: Joi.string().trim().pattern(phonePattern).min(9).max(20).required(),
  logo: Joi.string().allow('', null).optional(),
  cover_photo: Joi.string().allow('', null).optional(),
  translations: Joi.array()
    .items(
      Joi.object({
        locale: Joi.string().trim().valid('en', 'he').required(),
        name: Joi.string().allow('').max(191).default(''),
        address: Joi.string().allow('').max(1000).default(''),
      })
    )
    .default([]),
});

export const shopAnnouncementSchema = Joi.object({
  announcement: Joi.boolean().required(),
  announcement_message: Joi.when('announcement', {
    is: true,
    then: Joi.string().trim().max(255).required(),
    otherwise: Joi.string().allow('').max(255).default(''),
  }),
});
