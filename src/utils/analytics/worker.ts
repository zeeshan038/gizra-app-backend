import prisma from '../../config/database';
import {
  abandonedCartMinutes,
  abandonedCartPollMs,
  isAbandonedCartEnabled,
} from './config';
import { deliverWhatsappCartRecovery } from './whatsappRecovery';

let workerTimer: NodeJS.Timeout | null = null;
let ticking = false;

export async function processAbandonedCarts(limit = 50): Promise<number> {
  if (!isAbandonedCartEnabled()) return 0;

  const minutes = abandonedCartMinutes();
  const cutoff = new Date(Date.now() - minutes * 60_000);
  const now = new Date();

  const due = await prisma.abandoned_cart_sessions.findMany({
    where: {
      status: 'active',
      last_activity_at: { lte: cutoff },
    },
    orderBy: { last_activity_at: 'asc' },
    take: limit,
  });

  let processed = 0;
  for (const row of due) {
    processed += 1;
    await prisma.abandoned_cart_sessions.update({
      where: { id: row.id },
      data: {
        status: 'abandoned',
        abandoned_at: now,
        updated_at: now,
        whatsapp_status: 'pending',
      },
    });
    await deliverWhatsappCartRecovery(row.id);
  }

  // Retry failed deliveries (webhook was down / keys added later)
  const retry = await prisma.abandoned_cart_sessions.findMany({
    where: {
      status: 'abandoned',
      whatsapp_status: { in: ['failed', 'pending'] },
      abandoned_at: { not: null },
      whatsapp_attempts: { lt: 8 },
    },
    orderBy: { abandoned_at: 'asc' },
    take: 20,
  });
  for (const row of retry) {
    await deliverWhatsappCartRecovery(row.id);
  }

  return processed;
}

async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    await processAbandonedCarts();
  } catch (err) {
    console.error('[analytics] abandoned cart worker tick failed', err);
  } finally {
    ticking = false;
  }
}

export function startAbandonedCartWorker(): void {
  if (workerTimer) return;
  if (!isAbandonedCartEnabled()) {
    console.info('[analytics] abandoned cart worker not started (ABANDONED_CART_ENABLED off)');
    return;
  }
  const ms = abandonedCartPollMs();
  console.info(
    `[analytics] abandoned cart worker started (poll=${ms}ms, idle=${abandonedCartMinutes()}m)`
  );
  void tick();
  workerTimer = setInterval(() => {
    void tick();
  }, ms);
}

export function stopAbandonedCartWorker(): void {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
}
