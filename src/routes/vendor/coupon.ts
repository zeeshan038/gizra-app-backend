import express from 'express';
import { verifyVendor } from '../../middlewares/verifyVendor';
import {
  createVendorCoupon,
  deleteVendorCoupon,
  listVendorCoupons,
  setVendorCouponStatus,
  updateVendorCoupon,
} from '../../controllers/vendor/Coupon';

const router = express.Router();

router.use(verifyVendor);

router.get('/', listVendorCoupons);
router.post('/', createVendorCoupon);
router.put('/:id', updateVendorCoupon);
router.patch('/:id/status', setVendorCouponStatus);
router.delete('/:id', deleteVendorCoupon);

export default router;
