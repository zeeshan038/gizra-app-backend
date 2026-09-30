import express from 'express';
const router = express.Router();

import {
  acceptOrder,
  getActiveOrders,
  getLatestOrders,
  getMyOrders,
  updateOrderStatus,
} from '../../controllers/deliveryman/Order';
import { verifyDeliveryMan } from '../../middlewares/verifyDeliveryMan';

router.use(verifyDeliveryMan);

router.get('/active', getActiveOrders);
router.get('/latest', getLatestOrders);
router.get('/history', getMyOrders);
router.put('/:id/accept', acceptOrder);
router.put('/:id/status', updateOrderStatus);

export default router;
