import Joi from 'joi';

/** Optional body — omit to flip current value; set `enabled` to force on/off. */
export const pushNotificationToggleSchema = Joi.object({
  enabled: Joi.boolean().optional(),
});
