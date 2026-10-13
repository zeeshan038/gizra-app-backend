import express from 'express';
import { requireRegisteredConsumer, verifyConsumer } from '../../middlewares/verifyConsumer';
import {
  listLoyaltyTransactions,
  transferLoyaltyPoints,
} from '../../controllers/consumer/Loyalty';

const router = express.Router();

router.use(verifyConsumer, requireRegisteredConsumer);
router.post('/transfer', transferLoyaltyPoints);
router.get('/transactions', listLoyaltyTransactions);

export default router;
