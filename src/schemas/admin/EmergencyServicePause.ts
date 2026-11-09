import Joi from 'joi';

export const adminEmergencyServicePauseUpdateSchema = Joi.object({
  pause_all: Joi.boolean().optional(),
  zone_ids: Joi.array().items(Joi.number().integer().positive()).max(500).optional(),
  notice_message: Joi.string().trim().max(1000).allow('', null).optional(),
}).min(1);
