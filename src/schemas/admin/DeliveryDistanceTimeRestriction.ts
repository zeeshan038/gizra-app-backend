import Joi from 'joi';

const timePattern = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function isValidIanaTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const adminDeliveryDistanceTimeRestrictionUpdateSchema = Joi.object({
  enabled: Joi.boolean().optional(),
  max_distance_km: Joi.number().positive().max(500).optional(),
  start_time: Joi.string().pattern(timePattern).optional().messages({
    'string.pattern.base': 'start_time must be HH:mm (24h)',
  }),
  end_time: Joi.string().pattern(timePattern).optional().messages({
    'string.pattern.base': 'end_time must be HH:mm (24h)',
  }),
  timezone: Joi.string()
    .trim()
    .max(64)
    .optional()
    .custom((val, helpers) => {
      if (val == null || val === '') return val;
      if (!isValidIanaTimeZone(val)) {
        return helpers.error('any.invalid');
      }
      return val;
    })
    .messages({
      'any.invalid': 'timezone must be a valid IANA timezone (e.g. Asia/Jerusalem)',
    }),
  restaurant_ids: Joi.array().items(Joi.number().integer().positive()).max(2000).optional(),
}).min(1);
