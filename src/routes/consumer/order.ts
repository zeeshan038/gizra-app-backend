import express from 'express';
const router = express.Router();

import {
  placeOrder,
  getOrderHistory,
  getRunningOrders,
  getSubscriptionOrders,
} from '../../controllers/consumer/Order';
import { verifyConsumer } from '../../middlewares/verifyConsumer';

router.use(verifyConsumer);

router.post('/place', placeOrder);
router.get('/running', getRunningOrders);
router.get('/history', getOrderHistory);
router.get('/subscription', getSubscriptionOrders);

export default router;
