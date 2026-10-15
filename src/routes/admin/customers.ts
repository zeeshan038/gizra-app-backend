import express from 'express';
import {
  adminAddWalletFund,
  adminLoyaltyReport,
  adminWalletReport,
  createAdminWalletBonus,
  deleteAdminWalletBonus,
  listAdminCustomers,
  listAdminSubscribers,
  listAdminWalletBonuses,
  selectAdminCustomers,
  updateAdminCustomerStatus,
  updateAdminWalletBonusStatus,
} from '../../controllers/admin/customers';
import { verifyAdmin } from '../../middlewares/verifyAdmin';

const router = express.Router();
router.use(verifyAdmin);

router.get('/list', listAdminCustomers);
router.get('/select', selectAdminCustomers);
router.patch('/status/:id', updateAdminCustomerStatus);
router.get('/subscribers/list', listAdminSubscribers);
router.post('/wallet/add-fund', adminAddWalletFund);
router.get('/wallet/report', adminWalletReport);
router.get('/loyalty/report', adminLoyaltyReport);
router.get('/wallet/bonuses', listAdminWalletBonuses);
router.post('/wallet/bonuses', createAdminWalletBonus);
router.patch('/wallet/bonuses/:id/status', updateAdminWalletBonusStatus);
router.delete('/wallet/bonuses/:id', deleteAdminWalletBonus);

export default router;
