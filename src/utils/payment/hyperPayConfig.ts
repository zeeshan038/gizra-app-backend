export const HYP_SUCCESS_CCODES = ['0', '600', '700', '800'] as const;

export function getHyperPayConfig() {
  const baseUrl = (process.env.HYP_BASE_URL ?? 'https://pay.hyp.co.il/p/').replace(/\/?$/, '/');
  const masof = process.env.HYP_MASOF ?? '';
  const passP = process.env.HYP_PASSP ?? '';
  const apiKey = process.env.HYP_API_KEY ?? '';

  if (!masof || !passP || !apiKey) {
    throw new Error('HyperPay is not configured (HYP_MASOF, HYP_PASSP, HYP_API_KEY)');
  }

  return { baseUrl, masof, passP, apiKey };
}

/** Public origin for SuccessUrl / ErrorUrl / redirect_link (no trailing slash). */
export function getPaymentPublicBaseUrl(): string {
  const raw =
    process.env.API_PUBLIC_URL ??
    process.env.APP_URL ??
    process.env.PUBLIC_API_URL ??
    'http://localhost:3000';
  return raw.replace(/\/$/, '');
}
