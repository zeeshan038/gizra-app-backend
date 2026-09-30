import Joi from 'joi';

/** GET /delivery-man/home — no query/body params (driver from JWT). */
export const dmHomeSchema = Joi.object({});
