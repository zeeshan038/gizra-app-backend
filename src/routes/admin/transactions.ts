import express from 'express';
import {
  createAdminCollectCash,
  getAdminCollectCashAccountData,
  listAdminCollectCash,
  searchAdminCollectCashAccounts,
} from '../../controllers/admin/accountTransactions';
import {
  getAdminRestaurantWithdraw,
  getAdminRestaurantWithdrawPendingAlert,
  listAdminRestaurantWithdraws,
  patchAdminRestaurantWithdrawStatus,
} from '../../controllers/admin/restaurantWithdraws';
import {
  createAdminWithdrawMethod,
  deleteAdminWithdrawMethod,
  getAdminWithdrawMethod,
  listAdminWithdrawMethods,
  patchAdminWithdrawMethodDefault,
  patchAdminWithdrawMethodStatus,
  updateAdminWithdrawMethod,
} from '../../controllers/admin/withdrawMethods';
import { verifyAdmin } from '../../middlewares/verifyAdmin';

const router = express.Router();
router.use(verifyAdmin);

router.get('/collect-cash', listAdminCollectCash);
router.get('/collect-cash/accounts', searchAdminCollectCashAccounts);
router.get('/collect-cash/account-data', getAdminCollectCashAccountData);
router.post('/collect-cash', createAdminCollectCash);

router.get('/restaurant-withdraws/pending-alert', getAdminRestaurantWithdrawPendingAlert);
router.get('/restaurant-withdraws', listAdminRestaurantWithdraws);
router.get('/restaurant-withdraws/:id', getAdminRestaurantWithdraw);
router.patch('/restaurant-withdraws/:id/status', patchAdminRestaurantWithdrawStatus);

router.get('/withdraw-methods', listAdminWithdrawMethods);
router.get('/withdraw-methods/:id', getAdminWithdrawMethod);
router.post('/withdraw-methods', createAdminWithdrawMethod);
router.put('/withdraw-methods/:id', updateAdminWithdrawMethod);
router.patch('/withdraw-methods/:id/status', patchAdminWithdrawMethodStatus);
router.patch('/withdraw-methods/:id/default', patchAdminWithdrawMethodDefault);
router.delete('/withdraw-methods/:id', deleteAdminWithdrawMethod);

export default router;
