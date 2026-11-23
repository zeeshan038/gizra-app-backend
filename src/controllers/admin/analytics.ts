import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { ANALYTICS_EVENT_NAMES } from '../../utils/analytics/events';
import {
  abandonedCartMinutes,
  isAbandonedCartEnabled,
  isWhatsappCartRecoveryEnabled,
} from '../../utils/analytics/config';

function parseDateRange(query: Request['query']): { from: Date; to: Date } {
  const to = query.to ? new Date(String(query.to)) : new Date();
  const from = query.from
    ? new Date(String(query.from))
    : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  return {
    from: Number.isNaN(from.getTime()) ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) : from,
    to: Number.isNaN(to.getTime()) ? new Date() : to,
  };
}

/**
 * Conversion funnel for Super Admin.
 * @Route GET /api/admin/analytics/funnel
 */
export const adminAnalyticsFunnel = async (req: Request, res: Response): Promise<any> => {
  try {
    const { from, to } = parseDateRange(req.query);
    const steps = [
      'app_opened',
      'store_viewed',
      'added_to_cart',
      'checkout_started',
      'order_completed',
    ] as const;

    const counts: Record<string, number> = {};
    for (const step of steps) {
      const rows = await prisma.$queryRaw<Array<{ c: bigint }>>`
        SELECT COUNT(DISTINCT COALESCE(user_id::text, CONCAT('g:', guest_id::text))) AS c
        FROM user_analytics_events
        WHERE event_name = ${step}
          AND created_at >= ${from}
          AND created_at <= ${to}
      `;
      counts[step] = Number(rows[0]?.c ?? 0);
    }

    const opened = counts.app_opened || 0;
    const funnel = steps.map((step, index) => {
      const count = counts[step] || 0;
      const prev = index === 0 ? count : counts[steps[index - 1]] || 0;
      return {
        step,
        label: step,
        users: count,
        conversion_from_previous:
          prev > 0 ? Math.round((count / prev) * 10000) / 100 : null,
        conversion_from_open:
          opened > 0 ? Math.round((count / opened) * 10000) / 100 : null,
      };
    });

    return res.status(200).json({
      status: true,
      data: {
        from: from.toISOString(),
        to: to.toISOString(),
        funnel,
        config: {
          abandoned_cart_enabled: isAbandonedCartEnabled(),
          abandoned_cart_minutes: abandonedCartMinutes(),
          whatsapp_recovery_enabled: isWhatsappCartRecoveryEnabled(),
        },
      },
    });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * Event volume by name (debug / charts).
 * @Route GET /api/admin/analytics/events/summary
 */
export const adminAnalyticsEventsSummary = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const { from, to } = parseDateRange(req.query);
    const grouped = await prisma.user_analytics_events.groupBy({
      by: ['event_name'],
      where: { created_at: { gte: from, lte: to } },
      _count: { _all: true },
      orderBy: { event_name: 'asc' },
    });

    const byName = Object.fromEntries(
      ANALYTICS_EVENT_NAMES.map((n) => [n, 0])
    ) as Record<string, number>;
    for (const row of grouped) {
      byName[row.event_name] = row._count._all;
    }

    return res.status(200).json({
      status: true,
      data: {
        from: from.toISOString(),
        to: to.toISOString(),
        counts: byName,
        rows: grouped.map((r) => ({
          event_name: r.event_name,
          count: r._count._all,
        })),
      },
    });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * Abandoned cart list for Super Admin.
 * @Route GET /api/admin/analytics/abandoned-carts
 */
export const adminAbandonedCartsList = async (req: Request, res: Response): Promise<any> => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const status = req.query.status ? String(req.query.status) : undefined;
    const { from, to } = parseDateRange(req.query);

    const where: Prisma.abandoned_cart_sessionsWhereInput = {
      created_at: { gte: from, lte: to },
      ...(status ? { status } : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.abandoned_cart_sessions.count({ where }),
      prisma.abandoned_cart_sessions.findMany({
        where,
        orderBy: { updated_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return res.status(200).json({
      status: true,
      data: {
        page,
        limit,
        total,
        items: rows.map((r) => ({
          id: r.id.toString(),
          user_id: String(r.user_id),
          status: r.status,
          restaurant_id: r.restaurant_id != null ? String(r.restaurant_id) : null,
          restaurant_name: r.restaurant_name,
          customer_name: r.customer_name,
          customer_phone: r.customer_phone,
          cart_total: r.cart_total,
          last_activity_at: r.last_activity_at?.toISOString() ?? null,
          abandoned_at: r.abandoned_at?.toISOString() ?? null,
          recovered_at: r.recovered_at?.toISOString() ?? null,
          recovered_order_id:
            r.recovered_order_id != null ? String(r.recovered_order_id) : null,
          deeplink: r.deeplink,
          whatsapp_status: r.whatsapp_status,
          whatsapp_sent_at: r.whatsapp_sent_at?.toISOString() ?? null,
          whatsapp_attempts: r.whatsapp_attempts,
          whatsapp_last_error: r.whatsapp_last_error,
        })),
      },
    });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};
