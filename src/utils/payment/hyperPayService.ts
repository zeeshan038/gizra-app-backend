import { getHyperPayConfig, HYP_SUCCESS_CCODES } from './hyperPayConfig';
import type { PaymentRequestRow } from './paymentRequestRepository';

function parseQueryBody(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  const params = new URLSearchParams(body);
  params.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

export async function hyperPayCreateSignedCheckoutUrl(payment: PaymentRequestRow, urls: {
  successUrl: string;
  errorUrl: string;
}): Promise<string> {
  const { baseUrl, masof, passP, apiKey } = getHyperPayConfig();
  const payer = payment.payer_information ? JSON.parse(payment.payer_information) : {};
  const fullName = String(payer.name ?? 'Customer').trim();
  const nameParts = fullName.split(/\s+/);
  const firstName = nameParts[0] ?? 'Customer';
  const lastName = nameParts[1] ?? 'User';

  const params: Record<string, string> = {
    action: 'APISign',
    What: 'SIGN',
    KEY: apiKey,
    PassP: passP,
    Masof: masof,
    Order: payment.id,
    Info: `Payment ID: ${payment.id}`,
    Amount: String(payment.payment_amount),
    ClientName: firstName,
    ClientLName: lastName,
    UserId: payment.payer_id ?? 'guest',
    email: String(payer.email ?? 'test@test.com'),
    phone: String(payer.phone ?? '9999999999'),
    Coin: '1',
    UTF8: 'True',
    UTF8out: 'True',
    Sign: 'True',
    Template: '4',
    PageLang: 'HEB',
    SuccessUrl: urls.successUrl,
    ErrorUrl: urls.errorUrl,
  };

  const url = `${baseUrl}?${new URLSearchParams(params).toString()}`;
  const response = await fetch(url, { method: 'GET' });
  const text = await response.text();
  const signedParams = parseQueryBody(text);

  if (!signedParams.signature) {
    throw new Error('HyperPay did not return a signature');
  }

  return `${baseUrl}?${new URLSearchParams(signedParams).toString()}`;
}

export async function hyperPayVerifyCallback(responseData: Record<string, unknown>): Promise<boolean> {
  const { baseUrl, masof, passP, apiKey } = getHyperPayConfig();

  const params: Record<string, string> = {
    action: 'APISign',
    What: 'VERIFY',
    Masof: masof,
    KEY: apiKey,
    PassP: passP,
    Fild1: '',
    Fild2: '',
    Fild3: '',
  };

  const normalized = Object.fromEntries(
    Object.entries(responseData).map(([k, v]) => [k, v === null || v === undefined ? '' : String(v)])
  ) as Record<string, string>;

  Object.assign(params, normalized);

  const verifyUrl = `${baseUrl}?${new URLSearchParams(params).toString()}`;
  const response = await fetch(verifyUrl, { method: 'GET', signal: AbortSignal.timeout(15_000) });
  const text = await response.text();
  const result = parseQueryBody(text);
  return result.CCode === '0';
}

export function isHyperPaySuccessCCode(ccode: unknown): boolean {
  return (HYP_SUCCESS_CCODES as readonly string[]).includes(String(ccode ?? ''));
}
