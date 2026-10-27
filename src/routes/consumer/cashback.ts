import express from 'express';
import { requireRegisteredConsumer, verifyConsumer } from '../../middlewares/verifyConsumer';
import { getCashbackForAmount, listCashbacks } from '../../controllers/consumer/Cashback';

const router = express.Router();

router.use(verifyConsumer, requireRegisteredConsumer);
router.get('/list', listCashbacks);
router.get('/get', getCashbackForAmount);

export default router;
