import { Request, Response } from 'express';
import { dmEarningsQuerySchema } from '../../schemas/deliveryman/Earnings';
import { paginationSkip } from '../../utils/consumer/orderListHelpers';
import { requireDmIdFromRequest } from '../../utils/deliveryman/orderHelpers';
import {
  getDeliveryManEarningsHistory,
  getDeliveryManEarningsSummary,
} from '../../utils/deliveryman/earningsHelpers';

/**
 * @Description Earnings — wallet summary + full order earning history
 * @Route GET /api/delivery-man/earnings
 * @Access Private (Delivery Man)
 */
export const getEarnings = async (req: Request, res: Response): Promise<any> => {
  const deliveryManId = requireDmIdFromRequest(req);
  if (deliveryManId == null) {
    return res.status(401).json({ status: false, msg: 'Unauthorized' });
  }

  const validated = dmEarningsQuerySchema.validate(req.query, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(','),
    });
  }

  const { limit, offset, page, search, summary_only } = validated.value as {
    limit: number;
    offset: number;
    page?: number;
    search?: string;
    summary_only?: boolean;
  };
  const pageNum = page ?? offset;

  try {
    const summary = await getDeliveryManEarningsSummary(deliveryManId);

    if (summary_only) {
      return res.status(200).json({
        status: true,
        msg: 'Success',
        data: { summary },
      });
    }

    const skip = paginationSkip(limit, pageNum);
    const { total_size, history } = await getDeliveryManEarningsHistory(
      deliveryManId,
      skip,
      limit,
      search
    );

    return res.status(200).json({
      status: true,
      msg: 'Success',
      data: {
        summary,
        total_size,
        limit,
        offset: pageNum,
        history,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Request failed';
    return res.status(500).json({ status: false, msg });
  }
};
