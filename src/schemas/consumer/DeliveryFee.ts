import Joi from 'joi';

export const DELIVERY_FEE_BATCH_MAX_RESTAURANTS = 50;

export const deliveryFeeQuoteQuerySchema = Joi.object({
  restaurant_id: Joi.number().integer().positive().required(),
  destination_lat: Joi.alternatives(Joi.string(), Joi.number()).required(),
  destination_lng: Joi.alternatives(Joi.string(), Joi.number()).required(),
  /** Optional: skip Google/haversine when client already computed route distance. */
  distance_km: Joi.number().min(0).optional(),
});

/** Home-screen batch quote: one destination, many restaurants (≤ 50). */
export const deliveryFeeBatchBodySchema = Joi.object({
  destination_lat: Joi.alternatives(Joi.string(), Joi.number()).required(),
  destination_lng: Joi.alternatives(Joi.string(), Joi.number()).required(),
  restaurant_ids: Joi.array()
    .items(Joi.number().integer().positive())
    .min(1)
    .max(DELIVERY_FEE_BATCH_MAX_RESTAURANTS)
    .required(),
});
