import { Request, Response } from 'express';
import { merchantInquirySchema } from '../../schemas/public/MerchantInquiry';
import { createMerchantInquiry } from '../../utils/admin/merchantInquiries/service';
import { sendMerchantInquiryEmail } from '../../utils/public/merchantInquiryNotify';

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

  let saved;
  try {
    saved = await createMerchantInquiry({
      business_name: payload.business_name,
      contact_person: payload.contact_person,
      phone: payload.phone,
      email: payload.email,
      business_type: payload.business_type,
    });
  } catch (err) {
    console.error('[merchant-inquiry] save failed:', err instanceof Error ? err.message : err);
    return res.status(503).json({
      status: false,
      msg: 'Could not save your request right now. Please try again or contact us by phone.',
    });
  }

  const emailSent = await sendMerchantInquiryEmail(payload, saved.id);
  if (!emailSent) {
    console.warn('[merchant-inquiry] email failed for id', saved.id);
  }

  return res.status(200).json({
    status: true,
    msg: 'Thank you. We received your details and will contact you soon.',
  });
};
