import express from 'express';
const router = express.Router();

import { placeOrder, getOrderHistory } from '../../controllers/consumer/Order';
import { verifyConsumer } from '../../middlewares/verifyConsumer';

router.use(verifyConsumer);

router.post('/place', placeOrder);
router.get('/history', getOrderHistory);

export default router;
