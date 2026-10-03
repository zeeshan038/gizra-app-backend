import express from 'express';
const router = express.Router();

import {
  cancelOrder,
  placeOrder,
  getOrderHistory,
  getRunningOrders,
  getSubscriptionOrders,
  trackOrder,
} from '../../controllers/consumer/Order';
import { verifyConsumer } from '../../middlewares/verifyConsumer';

router.use(verifyConsumer);

router.post('/place', placeOrder);
router.get('/track', trackOrder);
router.put('/cancel', cancelOrder);
router.get('/running', getRunningOrders);
router.get('/history', getOrderHistory);
router.get('/subscription', getSubscriptionOrders);

export default router;
