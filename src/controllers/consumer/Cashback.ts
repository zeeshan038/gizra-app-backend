import { Request, Response } from 'express';
import {
   sendApiError,
    joiFirstMessage,
     errorMessageFromUnknown } from '../../utils/apiErrorResponse';
import { cashbackAmountQuerySchema } from '../../schemas/consumer/Wallet';
import {
  getCalculatedCashBackAmount,
  listActiveCashbacks,
} from '../../utils/consumer/cashbackHelpers';


/**
 * @Description Active cashback offers for this customer 
 * @Route GET /api/consumer/cashback/list
 * @Access Consumer (registered)
 */
export const listCashbacks = async (req: Request, res: Response): Promise<any> => {
  const customerId = Number(req.user?.id) || String(req.query.customer_id ?? 'all');
  try {
    const data = await listActiveCashbacks(customerId);
    return res.status(200).json({ status: true, data });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};


/**
 * @Description Calculate cashback for a cart amount (PHP GET /api/v1/cashback/getCashback)
 * @Route GET /api/consumer/cashback/get
 * @Access Consumer (registered)
 */
export const getCashbackForAmount = async (req: Request, res: Response): Promise<any> => {
  const validated = cashbackAmountQuerySchema.validate(req.query, { stripUnknown: true });
  if (validated.error) {
    return sendApiError(res, 403, joiFirstMessage(validated.error));
  }
  const { amount, customer_id } = validated.value as {
    amount: number;
    customer_id?: string | number;
  };
  const customerId = customer_id ?? Number(req.user?.id) ?? 'all';
  try {
    const data = await getCalculatedCashBackAmount(amount, customerId);
    return res.status(200).json({ status: true, data });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};
