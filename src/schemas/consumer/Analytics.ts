import Joi from 'joi';
import { ANALYTICS_EVENT_NAMES } from '../../utils/analytics/events';

const eventItemSchema = Joi.object({
  event_name: Joi.string()
    .valid(...ANALYTICS_EVENT_NAMES)
    .required(),
  client_session: Joi.string().max(128).optional().allow('', null),
  restaurant_id: Joi.number().optional().allow(null),
  zone_id: Joi.number().optional().allow(null),
  properties: Joi.object().unknown(true).optional().allow(null),
  occurred_at: Joi.string().isoDate().optional().allow(null),
});

export const trackAnalyticsEventsSchema = Joi.object({
  events: Joi.array().items(eventItemSchema).min(1).max(50).optional(),
  event_name: Joi.string()
    .valid(...ANALYTICS_EVENT_NAMES)
    .optional(),
  client_session: Joi.string().max(128).optional().allow('', null),
  restaurant_id: Joi.number().optional().allow(null),
  zone_id: Joi.number().optional().allow(null),
  properties: Joi.object().unknown(true).optional().allow(null),
  is_guest: Joi.boolean().optional(),
  guest_id: Joi.number().optional().allow(null),
}).or('events', 'event_name');

export type TrackAnalyticsEventsBody = {
  events?: Array<{
    event_name: string;
    client_session?: string | null;
    restaurant_id?: number | null;
    zone_id?: number | null;
    properties?: Record<string, unknown> | null;
  }>;
  event_name?: string;
  client_session?: string | null;
  restaurant_id?: number | null;
  zone_id?: number | null;
  properties?: Record<string, unknown> | null;
  is_guest?: boolean;
  guest_id?: number | null;
};
