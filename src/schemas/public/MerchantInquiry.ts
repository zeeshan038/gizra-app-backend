import Joi from 'joi';

export const merchantInquirySchema = Joi.object({
  business_name: Joi.string().trim().min(2).max(200).required(),
  contact_person: Joi.string().trim().min(2).max(200).required(),
  phone: Joi.string().trim().min(7).max(30).required(),
  email: Joi.string().trim().email({ tlds: { allow: false } }).optional().allow(''),
  business_type: Joi.string().trim().max(100).required(),
});

export type MerchantInquiryPayload = {
  business_name: string;
  contact_person: string;
  phone: string;
  email?: string;
  business_type: string;
};
