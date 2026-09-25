import { Request, Response } from 'express';

export type VendorNewOrderSsePayload = {
  order_id: string;
  order_amount: number;
  order_type: string;
  payment_method: string | null;
};

type SseClient = {
  res: Response;
  restaurantId: number;
  heartbeat: ReturnType<typeof setInterval>;
};

/** In-process subscribers (single Node instance). Use Redis pub/sub when scaling horizontally. */
const clientsByRestaurant = new Map<number, Set<SseClient>>();

function writeSse(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function subscribeVendorOrders(restaurantId: number, req: Request, res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 25000);

  const client: SseClient = { res, restaurantId, heartbeat };
  let set = clientsByRestaurant.get(restaurantId);
  if (!set) {
    set = new Set();
    clientsByRestaurant.set(restaurantId, set);
  }
  set.add(client);

  writeSse(res, 'connected', { restaurant_id: restaurantId });

  const cleanup = () => {
    clearInterval(heartbeat);
    set?.delete(client);
    if (set && set.size === 0) {
      clientsByRestaurant.delete(restaurantId);
    }
  };

  req.on('close', cleanup);
  req.on('aborted', cleanup);
  res.on('close', cleanup);
}

export function publishNewOrderToRestaurant(
  restaurantId: number,
  payload: VendorNewOrderSsePayload
): void {
  const set = clientsByRestaurant.get(restaurantId);
  if (!set?.size) return;

  for (const client of set) {
    try {
      writeSse(client.res, 'new_order', payload);
    } catch {
      // stale connection; cleaned up on close
    }
  }
}
