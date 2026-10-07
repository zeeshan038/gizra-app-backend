import express, { NextFunction, Request, Response } from 'express';
import { getConsumerReviews, submitConsumerReview } from '../../controllers/consumer/Review';
import { verifyConsumer } from '../../middlewares/verifyConsumer';

const router = express.Router();

/** `order_id` query needs JWT so `req.user` is set; `food_id` / `delivery_man_id` stay public. */
function verifyConsumerIfOrderQuery(req: Request, res: Response, next: NextFunction): void {
  const orderId = req.query.order_id;
  if (orderId == null || String(orderId).trim() === '') {
    next();
    return;
  }
  void verifyConsumer(req, res, next);
}

router.get('/', verifyConsumerIfOrderQuery, getConsumerReviews);

router.use(verifyConsumer);
router.post('/', submitConsumerReview);

export default router;
