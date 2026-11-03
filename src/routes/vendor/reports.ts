import express from 'express';
import {
  vendorCampaignOrderReport,
  vendorDisbursementReport,
  vendorExpenseReport,
  vendorFoodWiseReport,
  vendorOrderReport,
  vendorTransactionReport,
} from '../../controllers/vendor/reportmanagement';
import { verifyVendor } from '../../middlewares/verifyVendor';

const router = express.Router();
router.use(verifyVendor);

router.get('/transaction', vendorTransactionReport);
router.get('/expense', vendorExpenseReport);
router.get('/order', vendorOrderReport);
router.get('/campaign-order', vendorCampaignOrderReport);
router.get('/food-wise', vendorFoodWiseReport);
router.get('/disbursement', vendorDisbursementReport);

export default router;
