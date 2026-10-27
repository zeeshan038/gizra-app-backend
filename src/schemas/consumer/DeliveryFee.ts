import Joi from 'joi';

export const deliveryFeeQuoteQuerySchema = Joi.object({
  restaurant_id: Joi.number().integer().positive().required(),
  destination_lat: Joi.alternatives(Joi.string(), Joi.number()).required(),
  destination_lng: Joi.alternatives(Joi.string(), Joi.number()).required(),
  /** Optional: skip Google/haversine when client already computed route distance. */
  distance_km: Joi.number().min(0).optional(),
});
