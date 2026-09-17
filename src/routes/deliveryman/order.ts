import express from 'express';
const router = express.Router();

import { getLatestOrders, acceptOrder, updateOrderStatus } from '../../controllers/deliveryman/Order';
import { verifyDeliveryMan } from '../../middlewares/verifyDeliveryMan';

router.use(verifyDeliveryMan);

router.get('/latest', getLatestOrders);
router.put('/:id/accept', acceptOrder);
router.put('/:id/status', updateOrderStatus);

export default router;
