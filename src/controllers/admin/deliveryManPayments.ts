import { Request, Response } from 'express';
import {
  adminDeliveryManPaymentCreateSchema,
  adminDeliveryManPaymentListQuerySchema,
} from '../../schemas/admin/DeliveryManPayments';
import {
  createDeliveryManPayment,
  listDeliveryManPayments,
} from '../../utils/admin/transactions/deliveryManPayments';

/**
 * @Route GET /api/admin/transactions/delivery-man-payments
 */
export const listAdminDeliveryManPayments = async (req: Request, res: Response): Promise<any> => {
  const validated = adminDeliveryManPaymentListQuerySchema.validate(req.query, {
    stripUnknown: true,
  });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    const data = await listDeliveryManPayments(validated.value);
    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'List failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Route POST /api/admin/transactions/delivery-man-payments
 */
export const createAdminDeliveryManPayment = async (req: Request, res: Response): Promise<any> => {
  const validated = adminDeliveryManPaymentCreateSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message });
  }
  try {
    const data = await createDeliveryManPayment(validated.value);
    return res.status(201).json({
      status: true,
      msg: 'Delivery man payment recorded successfully',
      data,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Payment failed';
    const status = msg.includes('Insufficient') || msg.includes('not found') ? 400 : 500;
    return res.status(status).json({ status: false, msg });
  }
};
