import express from 'express';
import {
  adminCampaignOrderReport,
  adminCustomerLoyaltyReport,
  adminCustomerWalletReport,
  adminDisbursementDeliveryManReport,
  adminDisbursementRestaurantReport,
  adminExpenseReport,
  adminFoodWiseReport,
  adminOrderReport,
  adminRestaurantReport,
  adminSubscriptionReport,
  adminTransactionReport,
} from '../../controllers/admin/reportmanagement';
import { verifyAdmin } from '../../middlewares/verifyAdmin';

const router = express.Router();
router.use(verifyAdmin);

router.get('/transaction', adminTransactionReport);
router.get('/expense', adminExpenseReport);
router.get('/order', adminOrderReport);
router.get('/campaign-order', adminCampaignOrderReport);
router.get('/food-wise', adminFoodWiseReport);
router.get('/restaurant', adminRestaurantReport);
router.get('/subscription', adminSubscriptionReport);
router.get('/disbursement/restaurant', adminDisbursementRestaurantReport);
router.get('/disbursement/delivery-man', adminDisbursementDeliveryManReport);
router.get('/customer-wallet', adminCustomerWalletReport);
router.get('/customer-loyalty', adminCustomerLoyaltyReport);

export default router;
