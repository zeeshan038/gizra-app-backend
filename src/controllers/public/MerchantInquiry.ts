import { Request, Response } from 'express';
import { getBusinessSetting } from '../../utils/consumer/businessSettings';
import { sendSmtpMail } from '../../utils/mail/smtpMail';
import { merchantInquirySchema } from '../../schemas/public/MerchantInquiry';

const DEFAULT_INQUIRY_TO = 'Gizraapp@gmail.com';

async function merchantInquiryRecipient(): Promise<string> {
  const fromEnv = process.env.MERCHANT_INQUIRY_TO?.trim();
  if (fromEnv) return fromEnv;
  const fromSettings = (await getBusinessSetting('email_address'))?.trim();
  if (fromSettings) return fromSettings;
  return DEFAULT_INQUIRY_TO;
}

/**
 * @Route POST /api/public/merchant-inquiry
 * @Access Public (landing page join form)
 */
export const submitMerchantInquiry = async (req: Request, res: Response): Promise<any> => {
  const body = req.body ?? {};
  const normalized = {
    business_name: body.business_name ?? body.businessName,
    contact_person: body.contact_person ?? body.contactPerson,
    phone: body.phone,
    email: typeof body.email === 'string' ? body.email.trim() : '',
    business_type: body.business_type ?? body.businessType,
  };

  const validated = merchantInquirySchema.validate(normalized);
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(', '),
    });
  }

  const payload = validated.value;
  const to = await merchantInquiryRecipient();
  const emailLine = payload.email ? `Email: ${payload.email}\n` : 'Email: (not provided)\n';

  const text = [
    'New merchant join request from the Gizra landing page',
    '',
    `Business name: ${payload.business_name}`,
    `Contact person: ${payload.contact_person}`,
    `Phone: ${payload.phone}`,
    emailLine.trimEnd(),
    `Business type: ${payload.business_type}`,
  ].join('\n');

  const sent = await sendSmtpMail({
    to,
    subject: `Gizra — merchant inquiry: ${payload.business_name}`,
    text,
  });

  if (!sent) {
    return res.status(503).json({
      status: false,
      msg: 'Could not send your request right now. Please try again or contact us by phone.',
    });
  }

  return res.status(200).json({
    status: true,
    msg: 'Thank you. We received your details and will contact you soon.',
  });
};
