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
import { generatePaymentLink } from '../../controllers/consumer/PaymentLink';
import { verifyConsumer } from '../../middlewares/verifyConsumer';

router.post('/place', placeOrder);

router.use(verifyConsumer);

router.post('/generate-payment-link', generatePaymentLink);

router.get('/track', trackOrder);
router.put('/cancel', cancelOrder);
router.get('/running', getRunningOrders);
router.get('/history', getOrderHistory);
router.get('/subscription', getSubscriptionOrders);
export default router;
