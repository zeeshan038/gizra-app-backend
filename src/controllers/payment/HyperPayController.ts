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
import { hyperPayLog, sanitizeHypParams } from '../../utils/payment/hyperPayLogger';

const STORED_METHOD = 'hypay';

function buildFinalRedirect(payment: Awaited<ReturnType<typeof findPaymentRequestById>>, flag: 'success' | 'fail') {
  if (!payment) return null;

  const isPaymentFirst = payment.attribute === 'order_checkout';
  const tokenString = isPaymentFirst
    ? `payment_method=${payment.payment_method ?? STORED_METHOD}&&payment_request_id=${payment.id}&&checkout_flow=payment_first&&transaction_reference=${payment.transaction_id ?? ''}`
    : `payment_method=${payment.payment_method ?? STORED_METHOD}&&order_id=${payment.attribute_id ?? ''}&&checkout_flow=order_first&&transaction_reference=${payment.transaction_id ?? ''}`;
  const token = Buffer.from(tokenString, 'utf8').toString('base64');

  if (
    (payment.payment_platform === 'web' || payment.payment_platform === 'app') &&
    payment.external_redirect_link
  ) {
    const sep = payment.external_redirect_link.includes('?') ? '&' : '?';
    const extra =
      flag === 'success' && isPaymentFirst
        ? `&&payment_request_id=${encodeURIComponent(payment.id)}&&requires_place_order=1&&checkout_flow=payment_first`
        : flag === 'success' && payment.attribute === 'order' && payment.attribute_id
          ? `&&order_id=${encodeURIComponent(payment.attribute_id)}&&checkout_flow=order_first`
          : '';
    return `${payment.external_redirect_link}${sep}flag=${flag}&&token=${encodeURIComponent(token)}${extra}`;
  }
  return null;
}

function htmlResultPage(flag: 'success' | 'fail'): string {
  if (flag === 'success') {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment Successful</title></head><body style="font-family:sans-serif;text-align:center;padding:2rem;background:#f8fff8"><h2 style="color:#2a7a2a">&#10003; Payment Successful</h2><p>Your order has been confirmed. You may close this window.</p></body></html>`;
  }
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment Failed</title></head><body style="font-family:sans-serif;text-align:center;padding:2rem;background:#fff8f8"><h2 style="color:#b00020">&#10007; Payment Failed</h2><p>Your payment could not be processed. Please try again.</p></body></html>`;
}

/** PHP PaypalPaymentController::sendFinalResponse — WebViews often ignore 302 to custom schemes. */
function htmlDeepLinkRedirect(deepLink: string): string {
  const safe = deepLink.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><script>window.location.replace("${safe}");</script></head><body></body></html>`;
}

async function sendFinalResponse(res: Response, paymentId: string, flag: 'success' | 'fail') {
  const payment = await findPaymentRequestById(paymentId);
  const redirect = buildFinalRedirect(payment, flag);
  hyperPayLog('final_response', {
    payment_id: paymentId,
    flag,
    attribute: payment?.attribute ?? null,
    attribute_id: payment?.attribute_id ?? null,
    has_app_redirect: Boolean(redirect),
    callback: payment?.external_redirect_link ?? null,
  });
  if (redirect) {
    const ourHost = new URL(getPaymentPublicBaseUrl()).host;
    let scheme = '';
    let redirectHost: string | null = null;
    try {
      const parsed = new URL(redirect);
      scheme = parsed.protocol.replace(':', '');
      redirectHost = parsed.host;
    } catch {
      redirectHost = null;
    }
    if (redirectHost === ourHost) {
      return res.status(flag === 'success' ? 200 : 402).type('html').send(htmlResultPage(flag));
    }
    if (scheme && scheme !== 'http' && scheme !== 'https') {
      return res.status(200).type('html').send(htmlDeepLinkRedirect(redirect));
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
  hyperPayLog('pay_incoming', {
    payment_id: paymentId || null,
    method: req.method,
    ip: req.ip,
    user_agent: req.get('user-agent')?.slice(0, 120) ?? null,
    referer: req.get('referer') ?? null,
  });

  if (!paymentId) {
    return res.status(400).json({ status: false, msg: 'Invalid payment_id' });
  }

  try {
    const payment = await findUnpaidPaymentRequest(paymentId);
    if (!payment) {
      hyperPayLog('pay_not_found', { payment_id: paymentId });
      return res.status(404).json({ status: false, msg: 'Payment not found' });
    }

    const base = getPaymentPublicBaseUrl();
    const checkoutUrl = await hyperPayCreateSignedCheckoutUrl(payment, {
      successUrl: `${base}/payment/hyperpay/success?payment_id=${payment.id}`,
      errorUrl: `${base}/payment/hyperpay/failed?payment_id=${payment.id}`,
    });

    hyperPayLog('pay_redirect_hyp', {
      payment_id: payment.id,
      order_id: payment.attribute_id,
      amount: payment.payment_amount,
    });

    return res.redirect(302, checkoutUrl);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'HyperPay checkout failed';
    hyperPayLog('pay_error', { payment_id: paymentId, error: msg });
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

  hyperPayLog('success_callback', {
    payment_id: paymentId || null,
    method: req.method,
    params: sanitizeHypParams({ ...req.query, ...(req.body ?? {}) }),
  });

  const missingHypFields =
    Object.keys(hypParams).length === 0 || hypParams.Order == null || hypParams.Order === '';

  // HyP portal connectivity probe: empty request, no payment_id.
  if (!paymentId && missingHypFields) {
    hyperPayLog('success_skip', { reason: 'connectivity_test' });
    return res.status(200).type('html').send('<html><body><p>OK</p></body></html>');
  }

  // Browser hit SuccessUrl with only our payment_id (no Order/CCode/Sign) — common in WebView.
  if (paymentId && missingHypFields) {
    const payment = await findPaymentRequestById(paymentId);
    hyperPayLog('success_incomplete_redirect', {
      payment_id: paymentId,
      order_id: payment?.attribute_id ?? null,
      already_paid: payment?.is_paid ?? null,
      method: req.method,
    });
    if (payment?.is_paid) {
      return sendFinalResponse(res, payment.id, 'success');
    }
    if (payment && !payment.is_paid) {
      return sendFinalResponse(res, payment.id, 'fail');
    }
    return res.status(402).type('html').send(htmlResultPage('fail'));
  }

  const resolvedId = paymentId || String(hypParams.Order ?? '');
  const payment = await findPaymentRequestById(resolvedId);
  if (!payment) {
    hyperPayLog('success_payment_not_found', { resolved_id: resolvedId });
    return res.status(402).type('html').send(htmlResultPage('fail'));
  }

  if (hypParams.Sign) {
    await updatePaymentRequestGatewaySign(payment.id, String(hypParams.Sign));
  }

  const verified = await hyperPayVerifyCallback(hypParams);
  if (!verified) {
    hyperPayLog('success_verify_failed', {
      payment_id: payment.id,
      order_id: payment.attribute_id,
      ccode: hypParams.CCode ?? null,
    });
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
    hyperPayLog('success_paid', {
      payment_id: payment.id,
      order_id: payment.attribute_id,
      ccode: hypParams.CCode ?? null,
    });
    return sendFinalResponse(res, payment.id, 'success');
  }

  hyperPayLog('success_declined_ccode', {
    payment_id: payment.id,
    order_id: payment.attribute_id,
    ccode: hypParams.CCode ?? null,
  });
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

  hyperPayLog('failed_callback', {
    payment_id: paymentId || null,
    method: req.method,
    ip: req.ip,
    params: sanitizeHypParams(allParams as Record<string, unknown>),
  });

  if (Object.keys(allParams).length === 0) {
    hyperPayLog('failed_skip', { reason: 'empty_params' });
    return res.status(200).type('html').send('<html><body><p>OK</p></body></html>');
  }

  const hasOrder = allParams.Order != null && String(allParams.Order) !== '';
  if (!hasOrder && !paymentId) {
    hyperPayLog('failed_skip', { reason: 'missing_order_and_payment_id' });
    return res.status(200).type('html').send('<html><body><p>OK</p></body></html>');
  }

  const resolvedId = paymentId || String(allParams.Order ?? '');
  const payment = await findPaymentRequestById(resolvedId);
  if (!payment) {
    hyperPayLog('failed_payment_not_found', { resolved_id: resolvedId });
    return res.status(402).type('html').send(htmlResultPage('fail'));
  }

  hyperPayLog('failed_processing', {
    payment_id: payment.id,
    order_id: payment.attribute_id,
    ccode: allParams.CCode ?? allParams.ccode ?? null,
    already_paid: payment.is_paid,
  });

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

  hyperPayLog('notify_incoming', {
    method: req.method,
    ip: req.ip,
    params: sanitizeHypParams(responseData),
  });

  const paymentId = responseData.Order != null ? String(responseData.Order) : '';
  if (!paymentId) {
    hyperPayLog('notify_missing_order', {});
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
    hyperPayLog('notify_verify_failed', {
      payment_id: payment.id,
      ccode,
      is_success_ccode: isSuccess,
    });
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
    hyperPayLog('notify_success', { payment_id: payment.id, order_id: payment.attribute_id, ccode });
  } else if (!payment.is_paid) {
    hyperPayLog('notify_declined', { payment_id: payment.id, order_id: payment.attribute_id, ccode });
    await dispatchPaymentHook(payment.failure_hook, payment);
  }

  const accept = String(req.headers.accept ?? '');
  if (accept.includes('text/html')) {
    return sendFinalResponse(res, payment.id, isSuccess ? 'success' : 'fail');
  }
  return res.status(200).send('OK');
};
