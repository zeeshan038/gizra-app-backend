import express from 'express';
import {
  getAdminBusinessSetup,
  updateAdminBusiness,
  updateAdminCustomerSetup,
  updateAdminDeliverymanSetup,
  updateAdminDisbursementSetup,
  updateAdminLandingSetup,
  updateAdminLanguageSetup,
  updateAdminMaintenance,
  updateAdminOrderSetup,
  updateAdminPrioritySetup,
  updateAdminRefundSetup,
  updateAdminRestaurantSetup,
} from '../../controllers/admin/businessSetup';
import { verifyAdmin } from '../../middlewares/verifyAdmin';

const router = express.Router();

router.use(verifyAdmin);

router.get('/', getAdminBusinessSetup);
router.put('/maintenance', updateAdminMaintenance);
router.put('/business', updateAdminBusiness);
router.put('/order', updateAdminOrderSetup);
router.put('/restaurant', updateAdminRestaurantSetup);
router.put('/deliveryman', updateAdminDeliverymanSetup);
router.put('/customer', updateAdminCustomerSetup);
router.put('/priority', updateAdminPrioritySetup);
router.put('/disbursement', updateAdminDisbursementSetup);
router.put('/landing', updateAdminLandingSetup);
router.put('/refund', updateAdminRefundSetup);
router.put('/language', updateAdminLanguageSetup);

export default router;
