import { Request, Response } from 'express';
import { sendApiError, joiFirstMessage } from '../../utils/apiErrorResponse';
import { generatePaymentLinkSchema } from '../../schemas/consumer/PaymentLink';
import { placeOrderSchema } from '../../schemas/consumer/Order';
import {
  generateCheckoutPaymentLink,
  generateOrderPaymentLink,
} from '../../utils/payment/generatePaymentLink';
import { hyperPayLog } from '../../utils/payment/hyperPayLogger';
import { executePlaceOrder, PlaceOrderError } from './placeOrderLogic';

/**
 * @Description Create HyperPay (or other gateway) checkout URL — with or without an existing order
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

  const fName = req.user?.f_name ?? '';
  const lName = req.user?.l_name ?? '';
  const name = `${fName} ${lName}`.trim() || 'Customer';

  const payer = {
    name,
    email: req.user?.email ?? 'noemail@guest.com',
    phone: req.user?.phone ?? '0000000000',
  };

  try {
    if (order_id != null && String(order_id).trim() !== '') {
      const orderId = Number(order_id);
      if (!Number.isFinite(orderId) || orderId <= 0) {
        return sendApiError(res, 403, 'Invalid order_id');
      }

      const result = await generateOrderPaymentLink({
        userId,
        orderId,
        paymentMethod: payment_method,
        callback,
        paymentPlatform: payment_platform,
        payer,
      });
      hyperPayLog('generate_payment_link', {
        user_id: userId,
        order_id: orderId,
        payment_method,
        payment_platform,
        payment_request_id: result.payment_id,
        callback,
        flow: 'order_first',
      });
      return res.status(200).json({
        redirect_link: result.redirect_link,
        payment_request_id: result.payment_id,
      });
    }

    const checkoutValidated = placeOrderSchema.validate(
      { ...req.body, payment_method: 'digital_payment' },
      { stripUnknown: true }
    );
    if (checkoutValidated.error) {
      return sendApiError(res, 400, joiFirstMessage(checkoutValidated.error));
    }

    const quoted = await executePlaceOrder({
      payload: checkoutValidated.value,
      userId,
      isGuest: false,
      user: {
        f_name: req.user?.f_name,
        l_name: req.user?.l_name,
        phone: req.user?.phone,
        email: req.user?.email,
        wallet_balance: undefined,
      },
      dryRun: true,
    });

    const restaurantId = Number(checkoutValidated.value.restaurant_id);
    const result = await generateCheckoutPaymentLink({
      userId,
      restaurantId,
      orderAmount: quoted.orderAmount,
      paymentMethod: payment_method,
      callback,
      paymentPlatform: payment_platform,
      payer,
      checkoutPayload: checkoutValidated.value as Record<string, unknown>,
    });

    hyperPayLog('generate_payment_link', {
      user_id: userId,
      restaurant_id: restaurantId,
      payment_method,
      payment_platform,
      payment_request_id: result.payment_id,
      amount: quoted.orderAmount,
      callback,
      flow: 'payment_first',
    });

    return res.status(200).json({
      redirect_link: result.redirect_link,
      payment_request_id: result.payment_id,
      amount: quoted.orderAmount,
      checkout_flow: 'payment_first',
      next_step: 'complete_checkout_payment_after_hyp_success',
    });
  } catch (e: unknown) {
    if (e instanceof PlaceOrderError) {
      return sendApiError(res, e.statusCode, e.message);
    }
    const msg = e instanceof Error ? e.message : 'Payment link failed';
    if (msg.includes('not found') || msg.includes('already paid')) {
      return sendApiError(res, 404, msg);
    }
    return sendApiError(res, 500, msg);
  }
};
