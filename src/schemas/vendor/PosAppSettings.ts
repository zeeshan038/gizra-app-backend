import Joi from 'joi';

export const posAppSettingsSchema = Joi.object({
  autoAcceptOrder: Joi.boolean().optional(),
  autoPrintOnAccept: Joi.boolean().optional(),
  use58mmPaper: Joi.boolean().optional(),
}).min(1);
