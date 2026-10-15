import express from 'express';
import {
  getAdminNewOrderAlertHandler,
  getAdminOrderCountsHandler,
  deleteAdminOrderHandler,
  getAdminOrderDetailHandler,
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
router.get('/:orderId', getAdminOrderDetailHandler);
router.get('/', listAdminOrdersHandler);

export default router;
