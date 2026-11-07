import { getBusinessSetting } from '../consumer/businessSettings';
import { sendSmtpMail } from '../mail/smtpMail';
import type { MerchantInquiryPayload } from '../../schemas/public/MerchantInquiry';

const DEFAULT_INQUIRY_TO = 'gizraapp@gmail.com';

export async function merchantInquiryRecipient(): Promise<string> {
  const fromEnv = process.env.MERCHANT_INQUIRY_TO?.trim();
  if (fromEnv) return fromEnv;
  const fromSettings = (await getBusinessSetting('email_address'))?.trim();
  if (fromSettings) return fromSettings;
  return DEFAULT_INQUIRY_TO;
}

export function merchantInquiryEmailBody(payload: MerchantInquiryPayload, inquiryId: number): string {
  const emailLine = payload.email ? `Email: ${payload.email}` : 'Email: (not provided)';
  return [
    'New merchant join request from the Gizra landing page',
    '',
    `Request ID: ${inquiryId}`,
    `Business name: ${payload.business_name}`,
    `Contact person: ${payload.contact_person}`,
    `Phone: ${payload.phone}`,
    emailLine,
    `Business type: ${payload.business_type}`,
    '',
    'View in admin panel: Landing Join Requests',
  ].join('\n');
}

export async function sendMerchantInquiryEmail(
  payload: MerchantInquiryPayload,
  inquiryId: number,
): Promise<boolean> {
  const to = await merchantInquiryRecipient();
  const text = merchantInquiryEmailBody(payload, inquiryId);
  return sendSmtpMail({
    to,
    subject: `Gizra — merchant inquiry: ${payload.business_name}`,
    text,
  });
}
