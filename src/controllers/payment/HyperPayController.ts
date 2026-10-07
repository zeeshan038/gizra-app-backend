import { Request, Response } from 'express';
import {
  dispatchPaymentHook,
} from '../../utils/payment/orderDigitalPaymentHooks';
import { getPaymentPublicBaseUrl } from '../../utils/payment/hyperPayConfig';
import {
  hyperPayCreateSignedCheckoutUrl,
  hyperPayVerifyCallback,
  isHyperPaySuccessCCode,
} from '../../utils/payment/hyperPayService';
import {
  findPaymentRequestById,
  findUnpaidPaymentRequest,
  markPaymentRequestPaid,
  updatePaymentRequestGatewaySign,
} from '../../utils/payment/paymentRequestRepository';

const STORED_METHOD = 'hypay';

function buildFinalRedirect(payment: Awaited<ReturnType<typeof findPaymentRequestById>>, flag: 'success' | 'fail') {
  if (!payment) return null;
  const tokenString = `payment_method=${payment.payment_method ?? STORED_METHOD}&&attribute_id=${payment.attribute_id}&&transaction_reference=${payment.transaction_id ?? ''}`;
  const token = Buffer.from(tokenString, 'utf8').toString('base64');

  if (
    (payment.payment_platform === 'web' || payment.payment_platform === 'app') &&
    payment.external_redirect_link
  ) {
    const sep = payment.external_redirect_link.includes('?') ? '&' : '?';
    return `${payment.external_redirect_link}${sep}flag=${flag}&&token=${encodeURIComponent(token)}`;
  }
  return null;
}

function htmlResultPage(flag: 'success' | 'fail'): string {
  if (flag === 'success') {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment Successful</title></head><body style="font-family:sans-serif;text-align:center;padding:2rem;background:#f8fff8"><h2 style="color:#2a7a2a">&#10003; Payment Successful</h2><p>Your order has been confirmed. You may close this window.</p></body></html>`;
  }
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment Failed</title></head><body style="font-family:sans-serif;text-align:center;padding:2rem;background:#fff8f8"><h2 style="color:#b00020">&#10007; Payment Failed</h2><p>Your payment could not be processed. Please try again.</p></body></html>`;
}

async function sendFinalResponse(res: Response, paymentId: string, flag: 'success' | 'fail') {
  const payment = await findPaymentRequestById(paymentId);
  const redirect = buildFinalRedirect(payment, flag);
  if (redirect) {
    const ourHost = new URL(getPaymentPublicBaseUrl()).host;
    let redirectHost: string | null = null;
    try {
      redirectHost = new URL(redirect).host;
    } catch {
      redirectHost = null;
    }
    if (redirectHost === ourHost) {
      return res.status(flag === 'success' ? 200 : 402).type('html').send(htmlResultPage(flag));
    }
    return res.redirect(302, redirect);
  }
  return res.status(flag === 'success' ? 200 : 402).type('html').send(htmlResultPage(flag));
}

/**
 * @Route GET /payment/hyperpay/pay
 */
export const hyperPayCheckout = async (req: Request, res: Response): Promise<any> => {
  const paymentId = String(req.query.payment_id ?? '').trim();
  if (!paymentId) {
    return res.status(400).json({ status: false, msg: 'Invalid payment_id' });
  }

  try {
    const payment = await findUnpaidPaymentRequest(paymentId);
    if (!payment) {
      return res.status(404).json({ status: false, msg: 'Payment not found' });
    }

    const base = getPaymentPublicBaseUrl();
    const checkoutUrl = await hyperPayCreateSignedCheckoutUrl(payment, {
      successUrl: `${base}/payment/hyperpay/success?payment_id=${payment.id}`,
      errorUrl: `${base}/payment/hyperpay/failed?payment_id=${payment.id}`,
    });

    return res.redirect(302, checkoutUrl);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'HyperPay checkout failed';
    return res.status(500).json({ status: false, msg });
  }
};

function extractHypParams(req: Request): Record<string, unknown> {
  const { payment_id: _pid, ...rest } = req.query as Record<string, unknown>;
  if (req.method === 'POST' && req.body && typeof req.body === 'object') {
    return { ...rest, ...req.body };
  }
  return rest;
}

/**
 * @Route ALL /payment/hyperpay/success
 */
export const hyperPaySuccess = async (req: Request, res: Response): Promise<any> => {
  const paymentId = String(req.query.payment_id ?? req.body?.payment_id ?? '').trim();
  const hypParams = extractHypParams(req);

  if (Object.keys(hypParams).length === 0 || hypParams.Order == null) {
    return res.status(200).type('html').send('<html><body><p>OK</p></body></html>');
  }

  const resolvedId = paymentId || String(hypParams.Order ?? '');
  const payment = await findPaymentRequestById(resolvedId);
  if (!payment) {
    return res.status(402).type('html').send(htmlResultPage('fail'));
  }

  if (hypParams.Sign) {
    await updatePaymentRequestGatewaySign(payment.id, String(hypParams.Sign));
  }

  const verified = await hyperPayVerifyCallback(hypParams);
  if (!verified) {
    return sendFinalResponse(res, payment.id, 'fail');
  }

  if (isHyperPaySuccessCCode(hypParams.CCode)) {
    if (!payment.is_paid) {
      await markPaymentRequestPaid({
        id: payment.id,
        payment_method: STORED_METHOD,
        transaction_id: hypParams.Id != null ? String(hypParams.Id) : null,
        gateway_callback_url: hypParams.Sign != null ? String(hypParams.Sign) : null,
      });
      const fresh = await findPaymentRequestById(payment.id);
      if (fresh) await dispatchPaymentHook(fresh.success_hook, fresh);
    }
    return sendFinalResponse(res, payment.id, 'success');
  }

  if (!payment.is_paid) {
    await dispatchPaymentHook(payment.failure_hook, payment);
  }
  return sendFinalResponse(res, payment.id, 'fail');
};

/**
 * @Route ALL /payment/hyperpay/failed
 */
export const hyperPayFailed = async (req: Request, res: Response): Promise<any> => {
  const paymentId = String(req.query.payment_id ?? req.body?.payment_id ?? '').trim();
  const allParams = { ...req.query, ...(req.body ?? {}) };

  if (Object.keys(allParams).length === 0 || allParams.Order == null) {
    return res.status(200).type('html').send('<html><body><p>OK</p></body></html>');
  }

  const resolvedId = paymentId || String(allParams.Order ?? '');
  const payment = await findPaymentRequestById(resolvedId);
  if (!payment) {
    return res.status(402).type('html').send(htmlResultPage('fail'));
  }

  if (!payment.is_paid) {
    await dispatchPaymentHook(payment.failure_hook, payment);
  }
  return sendFinalResponse(res, payment.id, 'fail');
};

/**
 * @Route ALL /payment/hyperpay/notify
 */
export const hyperPayWebhook = async (req: Request, res: Response): Promise<any> => {
  const responseData =
    req.method === 'POST' && req.body && typeof req.body === 'object'
      ? (req.body as Record<string, unknown>)
      : (req.query as Record<string, unknown>);

  const paymentId = responseData.Order != null ? String(responseData.Order) : '';
  if (!paymentId) {
    return res.status(400).send('Missing Order');
  }

  const payment = await findPaymentRequestById(paymentId);
  if (!payment) {
    return res.status(200).send('OK');
  }

  if (responseData.Sign) {
    await updatePaymentRequestGatewaySign(payment.id, String(responseData.Sign));
  }

  const ccode = responseData.CCode;
  const isSuccess = isHyperPaySuccessCCode(ccode);
  const verified = await hyperPayVerifyCallback(responseData);

  if (!verified) {
    if (isSuccess) return res.status(400).send('Invalid signature');
  }

  if (isSuccess) {
    if (!payment.is_paid) {
      await markPaymentRequestPaid({
        id: payment.id,
        payment_method: STORED_METHOD,
        transaction_id: responseData.Id != null ? String(responseData.Id) : null,
        gateway_callback_url: responseData.Sign != null ? String(responseData.Sign) : null,
      });
      const fresh = await findPaymentRequestById(payment.id);
      if (fresh) await dispatchPaymentHook(fresh.success_hook, fresh);
    }
  } else if (!payment.is_paid) {
    await dispatchPaymentHook(payment.failure_hook, payment);
  }

  const accept = String(req.headers.accept ?? '');
  if (accept.includes('text/html')) {
    return sendFinalResponse(res, payment.id, isSuccess ? 'success' : 'fail');
  }
  return res.status(200).send('OK');
};
