import Joi from 'joi';

export const adminSendPushNotificationSchema = Joi.object({
  title: Joi.string().trim().max(191).required(),
  description: Joi.string().trim().max(1000).required(),
  tergat: Joi.string().valid('customer', 'deliveryman', 'restaurant').required(),
  zone: Joi.alternatives()
    .try(Joi.string().valid('all'), Joi.number().integer().positive())
    .required(),
  image: Joi.string().trim().max(191).optional().allow('', null),
});
