import { Request, Response } from 'express';
import { sendApiError, joiFirstMessage } from '../../utils/apiErrorResponse';
import { generatePaymentLinkSchema } from '../../schemas/consumer/PaymentLink';
import { generateOrderPaymentLink } from '../../utils/payment/generatePaymentLink';

/**
 * @Description Create HyperPay (or other gateway) checkout URL for an unpaid order
 * @Route POST /api/consumer/order/generate-payment-link
 * @Access Consumer (JWT)
 */
export const generatePaymentLink = async (req: Request, res: Response): Promise<any> => {
  const validated = generatePaymentLinkSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return sendApiError(res, 403, joiFirstMessage(validated.error));
  }

  const userId = Number(req.user?.id);
  if (!userId || req.user?.isGuest) {
    return sendApiError(res, 401, 'Login required');
  }

  const { order_id, payment_method, callback, payment_platform } = validated.value;
  const orderId = Number(order_id);
  if (!Number.isFinite(orderId) || orderId <= 0) {
    return sendApiError(res, 403, 'Invalid order_id');
  }

  const fName = req.user?.f_name ?? '';
  const lName = req.user?.l_name ?? '';
  const name = `${fName} ${lName}`.trim() || 'Customer';

  try {
    const result = await generateOrderPaymentLink({
      userId,
      orderId,
      paymentMethod: payment_method,
      callback,
      paymentPlatform: payment_platform,
      payer: {
        name,
        email: req.user?.email ?? 'noemail@guest.com',
        phone: req.user?.phone ?? '0000000000',
      },
    });
    return res.status(200).json({ redirect_link: result.redirect_link });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Payment link failed';
    if (msg.includes('not found') || msg.includes('already paid')) {
      return sendApiError(res, 404, msg);
    }
    return sendApiError(res, 500, msg);
  }
};
