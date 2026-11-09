import Joi from 'joi';

export const placeAutocompleteQuerySchema = Joi.object({
  search_text: Joi.string().trim().min(1).required(),
  /** Optional — overrides server default bias (near active delivery areas). */
  bias_lat: Joi.number().min(-90).max(90),
  bias_lng: Joi.number().min(-180).max(180),
  bias_radius_km: Joi.number().min(1).max(500),
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
