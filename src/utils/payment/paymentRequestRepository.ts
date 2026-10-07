import { randomUUID } from 'crypto';
import prisma from '../../config/database';

export type PaymentRequestRow = {
  id: string;
  payer_id: string | null;
  receiver_id: string | null;
  payment_amount: number;
  gateway_callback_url: string | null;
  success_hook: string | null;
  failure_hook: string | null;
  transaction_id: string | null;
  currency_code: string;
  payment_method: string | null;
  additional_data: string | null;
  is_paid: boolean;
  payer_information: string | null;
  external_redirect_link: string | null;
  receiver_information: string | null;
  attribute_id: string | null;
  attribute: string | null;
  payment_platform: string | null;
};

function mapRow(row: Record<string, unknown>): PaymentRequestRow {
  return {
    id: String(row.id),
    payer_id: row.payer_id != null ? String(row.payer_id) : null,
    receiver_id: row.receiver_id != null ? String(row.receiver_id) : null,
    payment_amount: Number(row.payment_amount) || 0,
    gateway_callback_url: row.gateway_callback_url != null ? String(row.gateway_callback_url) : null,
    success_hook: row.success_hook != null ? String(row.success_hook) : null,
    failure_hook: row.failure_hook != null ? String(row.failure_hook) : null,
    transaction_id: row.transaction_id != null ? String(row.transaction_id) : null,
    currency_code: String(row.currency_code ?? 'USD'),
    payment_method: row.payment_method != null ? String(row.payment_method) : null,
    additional_data: row.additional_data != null ? String(row.additional_data) : null,
    is_paid: row.is_paid === true,
    payer_information: row.payer_information != null ? String(row.payer_information) : null,
    external_redirect_link:
      row.external_redirect_link != null ? String(row.external_redirect_link) : null,
    receiver_information: row.receiver_information != null ? String(row.receiver_information) : null,
    attribute_id: row.attribute_id != null ? String(row.attribute_id) : null,
    attribute: row.attribute != null ? String(row.attribute) : null,
    payment_platform: row.payment_platform != null ? String(row.payment_platform) : null,
  };
}

export async function findUnpaidPaymentRequest(id: string): Promise<PaymentRequestRow | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM payment_requests WHERE id = ${id} AND is_paid = false LIMIT 1
  `;
  if (!rows.length) return null;
  return mapRow(rows[0]);
}

export async function findPaymentRequestById(id: string): Promise<PaymentRequestRow | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM payment_requests WHERE id = ${id} LIMIT 1
  `;
  if (!rows.length) return null;
  return mapRow(rows[0]);
}

export type CreatePaymentRequestInput = {
  payer_id: string;
  receiver_id: string;
  payment_amount: number;
  success_hook: string;
  failure_hook: string;
  currency_code: string;
  payment_method: string;
  additional_data: Record<string, unknown>;
  payer_information: Record<string, unknown>;
  receiver_information: Record<string, unknown>;
  external_redirect_link: string;
  attribute: string;
  attribute_id: string;
  payment_platform: string;
};

export async function createPaymentRequest(input: CreatePaymentRequestInput): Promise<string> {
  const id = randomUUID();
  const now = new Date();
  await prisma.$executeRaw`
    INSERT INTO payment_requests (
      id, payer_id, receiver_id, payment_amount, success_hook, failure_hook,
      currency_code, payment_method, additional_data, payer_information,
      receiver_information, external_redirect_link, attribute, attribute_id,
      payment_platform, is_paid, created_at, updated_at
    ) VALUES (
      ${id},
      ${input.payer_id},
      ${input.receiver_id},
      ${input.payment_amount},
      ${input.success_hook},
      ${input.failure_hook},
      ${input.currency_code},
      ${input.payment_method},
      ${JSON.stringify(input.additional_data)},
      ${JSON.stringify(input.payer_information)},
      ${JSON.stringify(input.receiver_information)},
      ${input.external_redirect_link},
      ${input.attribute},
      ${input.attribute_id},
      ${input.payment_platform},
      false,
      ${now},
      ${now}
    )
  `;
  return id;
}

export async function markPaymentRequestPaid(params: {
  id: string;
  payment_method: string;
  transaction_id: string | null;
  gateway_callback_url?: string | null;
}): Promise<void> {
  const now = new Date();
  await prisma.$executeRaw`
    UPDATE payment_requests
    SET is_paid = true,
        payment_method = ${params.payment_method},
        transaction_id = ${params.transaction_id},
        gateway_callback_url = COALESCE(${params.gateway_callback_url ?? null}, gateway_callback_url),
        updated_at = ${now}
    WHERE id = ${params.id}
  `;
}

export async function updatePaymentRequestGatewaySign(id: string, sign: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE payment_requests SET gateway_callback_url = ${sign}, updated_at = ${new Date()}
    WHERE id = ${id}::uuid
  `;
}
