import express from 'express';
import { requireRegisteredConsumer, verifyConsumer } from '../../middlewares/verifyConsumer';
import {
  addWalletFund,
  listWalletBonuses,
  listWalletTransactions,
} from '../../controllers/consumer/Wallet';

const router = express.Router();

router.use(verifyConsumer, requireRegisteredConsumer);
router.get('/transactions', listWalletTransactions);
router.get('/bonuses', listWalletBonuses);
router.post('/add-fund', addWalletFund);

export default router;
