import express from 'express';
const router = express.Router();

import {
  attachCheckoutPayment,
  cancelOrder,
  completeCheckoutPayment,
  placeOrder,
  quoteOrder,
  getOrderHistory,
  getRunningOrders,
  getSubscriptionOrders,
  trackOrder,
} from '../../controllers/consumer/Order';
import {
  getCancellationReasons,
  getFoodListByIds,
  getMostTips,
  getOrderDetails,
  getPendingReviews,
  getRefundReasons,
  orderAgain,
  requestRefund,
  sendOrderNotification,
  submitOfflinePayment,
  updateOfflinePaymentInfo,
  updatePaymentMethod,
} from '../../controllers/consumer/OrderExtras';
import { generatePaymentLink } from '../../controllers/consumer/PaymentLink';
import { verifyConsumer } from '../../middlewares/verifyConsumer';

router.get('/cancellation-reasons', getCancellationReasons);
router.get('/refund-reasons', getRefundReasons);
router.get('/most-tips', getMostTips);

router.post('/quote', verifyConsumer, quoteOrder);
router.post('/place', verifyConsumer, placeOrder);

router.use(verifyConsumer);

router.post('/attach-checkout-payment', attachCheckoutPayment);
router.post('/complete-checkout-payment', completeCheckoutPayment);
router.post('/generate-payment-link', generatePaymentLink);

router.get('/track', trackOrder);
router.get('/details', getOrderDetails);
router.put('/cancel', cancelOrder);
router.post('/refund-request', requestRefund);
router.put('/payment-method', updatePaymentMethod);
router.put('/offline-payment', submitOfflinePayment);
router.put('/offline-payment-update', updateOfflinePaymentInfo);
router.get('/pending-reviews', getPendingReviews);
router.post('/food-list', getFoodListByIds);
router.get('/again', orderAgain);
router.post('/send-notification/:order_id', sendOrderNotification);
router.get('/running', getRunningOrders);
router.get('/history', getOrderHistory);
router.get('/subscription', getSubscriptionOrders);
export default router;
