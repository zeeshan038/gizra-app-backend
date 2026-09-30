import { Request, Response } from 'express';
import { requireDmIdFromRequest } from '../../utils/deliveryman/orderHelpers';
import { getDeliveryManHomeStats } from '../../utils/deliveryman/homeStats';

/**
 * @Description Home dashboard stats (today / week / month orders + today's earning)
 * @Route GET /api/delivery-man/home
 * @Access Private (Delivery Man)
 */
export const getHome = async (req: Request, res: Response): Promise<any> => {
  const deliveryManId = requireDmIdFromRequest(req);
  if (deliveryManId == null) {
    return res.status(401).json({ status: false, msg: 'Unauthorized' });
  }

  try {
    const data = await getDeliveryManHomeStats(deliveryManId);
    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Request failed';
    return res.status(500).json({ status: false, msg });
  }
};
