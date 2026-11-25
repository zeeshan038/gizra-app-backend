function envFlag(name: string, defaultOn = false): boolean {
  const raw = process.env[name];
  if (raw == null || raw === '') return defaultOn;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
}

function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** Master switch for abandon detection worker + cart session writes. */
export function isAbandonedCartEnabled(): boolean {
  return envFlag('ABANDONED_CART_ENABLED', true);
}

/** Minutes of inactivity before a cart is marked abandoned (client: 15–20). */
export function abandonedCartMinutes(): number {
  return envInt('ABANDONED_CART_MINUTES', 20);
}

export function abandonedCartPollMs(): number {
  return envInt('ABANDONED_CART_POLL_MS', 60_000);
}

/** WhatsApp bot webhook — off until client provides URL + enables flag. */
export function isWhatsappCartRecoveryEnabled(): boolean {
  return (
    envFlag('WHATSAPP_CART_RECOVERY_ENABLED', false) &&
    Boolean(process.env.WHATSAPP_CART_RECOVERY_WEBHOOK_URL?.trim())
  );
}

export function whatsappCartRecoveryWebhookUrl(): string | null {
  const url = process.env.WHATSAPP_CART_RECOVERY_WEBHOOK_URL?.trim();
  return url || null;
}

export function whatsappCartRecoveryWebhookSecret(): string | null {
  const secret = process.env.WHATSAPP_CART_RECOVERY_WEBHOOK_SECRET?.trim();
  return secret || null;
}

export function whatsappCartRecoveryTimeoutMs(): number {
  return envInt('WHATSAPP_CART_RECOVERY_TIMEOUT_MS', 10_000);
}

export function customerAppDeeplinkBase(): string {
  return (
    process.env.GIZRA_CUSTOMER_APP_DEEPLINK_BASE?.trim() || 'gizra://checkout'
  );
}

export function buildCheckoutDeeplink(params: {
  restaurantId?: number | null;
  sessionId?: string | number | null;
}): string {
  const base = customerAppDeeplinkBase();
  const qs = new URLSearchParams();
  if (params.restaurantId != null && Number.isFinite(params.restaurantId)) {
    qs.set('restaurant_id', String(params.restaurantId));
  }
  if (params.sessionId != null) {
    qs.set('abandoned_cart_id', String(params.sessionId));
  }
  const q = qs.toString();
  if (!q) return base;
  return base.includes('?') ? `${base}&${q}` : `${base}?${q}`;
}
