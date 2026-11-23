import { Request, Response } from 'express';
import {
  trackAnalyticsEventsSchema,
  TrackAnalyticsEventsBody,
} from '../../schemas/consumer/Analytics';
import { touchAbandonedCartSession } from '../../utils/analytics/abandonedCart';
import { recordAnalyticsEvents } from '../../utils/analytics/events';
import { resolveCartSessionFromRequest } from '../../utils/consumer/cartSession';

/**
 * @Description Ingest Customer App funnel events (batch or single).
 * @Route POST /api/consumer/analytics/events
 */
export const trackAnalyticsEvents = async (req: Request, res: Response): Promise<any> => {
  const result = trackAnalyticsEventsSchema.validate(req.body, { stripUnknown: true });
  if (result.error) {
    return res.status(400).json({
      status: false,
      msg: result.error.details.map((d) => d.message).join(','),
    });
  }

  const body = result.value as TrackAnalyticsEventsBody;
  const session = resolveCartSessionFromRequest(req, {
    is_guest: body.is_guest,
    guest_id: body.guest_id ?? undefined,
  });

  // Allow anonymous open events with no auth only when guest_id provided via guest flow;
  // otherwise require a resolved session from JWT.
  if ('error' in session) {
    // Soft-allow app_opened without identity if explicitly guest payload missing —
    // still require guest_id for guests; logged-in must auth.
    return res.status(session.error.status).json({ status: false, msg: session.error.msg });
  }

  const baseIdentity = {
    user_id: session.is_guest ? null : session.user_id,
    guest_id: session.is_guest ? session.user_id : null,
    is_guest: session.is_guest,
  };

  const rawEvents =
    body.events && body.events.length
      ? body.events
      : body.event_name
        ? [
            {
              event_name: body.event_name,
              client_session: body.client_session,
              restaurant_id: body.restaurant_id,
              zone_id: body.zone_id,
              properties: body.properties,
            },
          ]
        : [];

  const recorded = await recordAnalyticsEvents(
    rawEvents.map((ev) => ({
      ...baseIdentity,
      event_name: ev.event_name,
      client_session: ev.client_session,
      restaurant_id: ev.restaurant_id,
      zone_id: ev.zone_id,
      properties: ev.properties ?? null,
    }))
  );

  const shouldTouchCart = rawEvents.some((ev) =>
    ['added_to_cart', 'checkout_started'].includes(ev.event_name)
  );
  if (shouldTouchCart && !session.is_guest) {
    const zoneId =
      rawEvents.find((e) => e.zone_id != null)?.zone_id ?? body.zone_id ?? null;
    const sourceEvent = rawEvents.some((e) => e.event_name === 'checkout_started')
      ? 'checkout_started'
      : 'added_to_cart';
    await touchAbandonedCartSession({
      userId: session.user_id,
      isGuest: false,
      sourceEvent,
      zoneId,
    });
  }

  return res.status(200).json({
    status: true,
    msg: 'Events recorded',
    data: { recorded },
  });
};
