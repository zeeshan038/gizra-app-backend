import Joi from 'joi';

export const consumerZoneIdQuerySchema = Joi.object({
  lat: Joi.number().required(),
  lng: Joi.number().required(),
});

export const consumerZoneCheckQuerySchema = Joi.object({
  lat: Joi.number().required(),
  lng: Joi.number().required(),
  zone_id: Joi.number().integer().required(),
});
