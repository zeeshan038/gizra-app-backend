import Joi from 'joi';

export const placeAutocompleteQuerySchema = Joi.object({
  search_text: Joi.string().trim().min(1).required(),
});

export const distanceQuerySchema = Joi.object({
  origin_lat: Joi.alternatives(Joi.string(), Joi.number()).required(),
  origin_lng: Joi.alternatives(Joi.string(), Joi.number()).required(),
  destination_lat: Joi.alternatives(Joi.string(), Joi.number()).required(),
  destination_lng: Joi.alternatives(Joi.string(), Joi.number()).required(),
});

export const placeDetailsQuerySchema = Joi.object({
  placeid: Joi.string().trim().required(),
});

export const geocodeQuerySchema = Joi.object({
  lat: Joi.alternatives(Joi.string(), Joi.number()).required(),
  lng: Joi.alternatives(Joi.string(), Joi.number()).required(),
});

export const extraChargeQuerySchema = Joi.object({
  distance: Joi.number().min(0).required(),
});
