import Joi from 'joi';

/** Destination coords for manual-dispatch delivery fee quote. */
export const dispatchDeliveryFeeQuerySchema = Joi.object({
  destination_lat: Joi.alternatives(Joi.string(), Joi.number()).required(),
  destination_lng: Joi.alternatives(Joi.string(), Joi.number()).required(),
});

export const adminDispatchDeliveryFeeQuerySchema = dispatchDeliveryFeeQuerySchema.keys({
  restaurant_id: Joi.number().integer().positive().required(),
});
