import Joi from 'joi';

export const placeAutocompleteQuerySchema = Joi.object({
  search_text: Joi.string().trim().min(1).required(),
  /**
   * Location bias — pass the user's map/GPS position so nearby places rank first
   * (e.g. Islamabad KFC before foreign matches). Aliases: lat / latitude.
   */
  bias_lat: Joi.number().min(-90).max(90),
  lat: Joi.number().min(-90).max(90),
  latitude: Joi.number().min(-90).max(90),
  bias_lng: Joi.number().min(-180).max(180),
  lng: Joi.number().min(-180).max(180),
  longitude: Joi.number().min(-180).max(180),
  bias_radius_km: Joi.number().min(1).max(500),
  /** Optional ISO-3166 alpha-2 country filter, e.g. PK or IL (overrides env when set). */
  region: Joi.string().trim().uppercase().pattern(/^[A-Z]{2}$/),
}).custom((value, helpers) => {
  const bias_lat = value.bias_lat ?? value.lat ?? value.latitude;
  const bias_lng = value.bias_lng ?? value.lng ?? value.longitude;
  if ((bias_lat == null) !== (bias_lng == null)) {
    return helpers.message({
      custom:
        'Provide both latitude and longitude for location bias (bias_lat + bias_lng, or lat + lng)',
    });
  }
  return {
    search_text: value.search_text,
    bias_lat,
    bias_lng,
    bias_radius_km: value.bias_radius_km,
    region: value.region,
  };
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
