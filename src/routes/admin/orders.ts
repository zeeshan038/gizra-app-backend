import express from 'express';
import {
  getAdminNewOrderAlertHandler,
  getAdminOrderCountsHandler,
  deleteAdminOrderHandler,
  getAdminOrderDetailHandler,
  assignAdminOrderDeliveryManHandler,
  updateAdminOrderStatusHandler,
  getAdminOrderInvoiceHandler,
  getAdminSubscriptionDetailHandler,
  listAdminOrdersHandler,
  listAdminSubscriptionsHandler,
} from '../../controllers/admin/orders';
import { verifyAdmin } from '../../middlewares/verifyAdmin';

const router = express.Router();

router.use(verifyAdmin);

router.get('/counts', getAdminOrderCountsHandler);
router.get('/new-order-alert', getAdminNewOrderAlertHandler);
router.get('/subscriptions/list', listAdminSubscriptionsHandler);
router.get('/subscriptions/:subscriptionId', getAdminSubscriptionDetailHandler);
router.delete('/:orderId', deleteAdminOrderHandler);
router.put('/:orderId/delivery-man', assignAdminOrderDeliveryManHandler);
router.put('/:orderId/status', updateAdminOrderStatusHandler);
router.get('/:orderId/invoice', getAdminOrderInvoiceHandler);
router.get('/:orderId', getAdminOrderDetailHandler);
router.get('/', listAdminOrdersHandler);

export default router;
