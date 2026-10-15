import express from 'express';
import {
  createAdminCoupon,
  deleteAdminCoupon,
  getAdminCoupon,
  listAdminCoupons,
  updateAdminCoupon,
  updateAdminCouponStatus,
} from '../../controllers/admin/coupons';
import { verifyAdmin } from '../../middlewares/verifyAdmin';

const router = express.Router();
router.use(verifyAdmin);

router.get('/list', listAdminCoupons);
router.get('/:id', getAdminCoupon);
router.post('/', createAdminCoupon);
router.put('/:id', updateAdminCoupon);
router.patch('/:id/status', updateAdminCouponStatus);
router.delete('/:id', deleteAdminCoupon);

export default router;
