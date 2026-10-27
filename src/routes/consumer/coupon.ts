import express from 'express';
import { requireRegisteredConsumer, verifyConsumer } from '../../middlewares/verifyConsumer';
import {
  applyCoupon,
  listCoupons,
  restaurantWiseCoupons,
} from '../../controllers/consumer/Coupon';

const router = express.Router();

router.get('/restaurant-wise', restaurantWiseCoupons);

router.use(verifyConsumer);
router.use(requireRegisteredConsumer);

router.get('/list', listCoupons);
router.get('/apply', applyCoupon);

export default router;
