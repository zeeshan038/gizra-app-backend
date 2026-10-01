import Joi from 'joi';

const base = {
  limit: Joi.number().integer().min(1).max(50).default(10),
  offset: Joi.number().integer().min(1).default(1),
  page: Joi.number().integer().min(1).optional(),
  days: Joi.number().integer().min(1).max(90),
};

export const notificationsInboxQuerySchema = Joi.object({
  ...base,
  days: base.days.default(7),
});

/** Legacy customer API used 15-day window. */
export const consumerNotificationsInboxQuerySchema = Joi.object({
  ...base,
  days: base.days.default(15),
});
