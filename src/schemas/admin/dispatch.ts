import Joi from 'joi';
import { vendorRequestDriverSchema } from '../vendor/dispatch';

export const adminRequestDriverSchema = vendorRequestDriverSchema.keys({
  restaurant_id: Joi.number().integer().positive().required(),
});
