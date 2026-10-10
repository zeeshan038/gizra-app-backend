import express from 'express';
import { prismaPing } from '../config/database';

const router = express.Router();

/** Same pool as the running API (startup already called connectDB). Never $disconnect here. */
router.get('/health/db', async (_req, res) => {
  try {
    await prismaPing();
    return res.status(200).json({ status: true, db: 'ok' });
  } catch (err) {
    console.error('[health/db]', err);
    return res.status(503).json({ status: false, db: 'unavailable' });
  }
});

//vendor
import vendorUserRoutes from './vendor/user';
import vendorCatalogRoutes from './vendor/catalog';
import vendorOrderRoutes from './vendor/order';
import vendorRestaurantRoutes from './vendor/restaurant';
import vendorShopRoutes from './vendor/shop';
import vendorDispatchRoutes from './vendor/dispatch';
import vendorMessageRoutes from './vendor/message';
import vendorDashboardRoutes from './vendor/dashboard';
import vendorCouponRoutes from './vendor/coupon';
import vendorReviewRoutes from './vendor/review';
import vendorWalletRoutes from './vendor/wallet';
import vendorWithdrawMethodRoutes from './vendor/withdrawMethod';
//consumer
import consumerUserRoutes from './consumer/user';
//deliveryman
import dmUserRoutes from './deliveryman/user';
import dmOrderRoutes from './deliveryman/order';
import dmMessageRoutes from './deliveryman/message';

//admin
import adminAuthRoutes from './admin/auth';
import adminVendorRoutes from './admin/vendors';
import adminBannerRoutes from './admin/banners';
import adminZoneRoutes from './admin/zones';

//vendor
router.use('/vendor',vendorUserRoutes);
router.use('/vendor/catalog', vendorCatalogRoutes);
router.use('/vendor/orders', vendorOrderRoutes);
router.use('/vendor/restaurant', vendorRestaurantRoutes);
router.use('/vendor/shop', vendorShopRoutes);
router.use('/vendor/dispatch', vendorDispatchRoutes);
router.use('/vendor/message', vendorMessageRoutes);
router.use('/vendor/dashboard', vendorDashboardRoutes);
router.use('/vendor/coupons', vendorCouponRoutes);
router.use('/vendor/reviews', vendorReviewRoutes);
router.use('/vendor/wallet', vendorWalletRoutes);
router.use('/vendor/withdraw-method', vendorWithdrawMethodRoutes);

//consumer
import consumerCartRoutes from './consumer/cart';
import consumerCouponRoutes from './consumer/coupon';
import consumerReviewRoutes from './consumer/review';
import consumerOrderRoutes from './consumer/order';
import consumerRestaurantRoutes from './consumer/restaurant';
import consumerFoodRoutes from './consumer/food';
import consumerDashboardRoutes from './consumer/dashboard';
import consumerAddressRoutes from './consumer/address';
import consumerFavouriteRoutes from './consumer/favourite';
import consumerZoneRoutes from './consumer/zone';
import consumerConfigRoutes from './consumer/config';
import consumerMessageRoutes from './consumer/message';
import sharedConfigRoutes from './config';
import legalPagesRoutes from './pages';

//consumer — public discover/config first; `/consumer` user router last (auth is per-route, not a catch-all)
router.use('/config', sharedConfigRoutes);
router.use('/pages', legalPagesRoutes);
router.use('/consumer/config', consumerConfigRoutes);
router.use('/consumer/zone', consumerZoneRoutes);
router.use('/consumer/restaurants', consumerRestaurantRoutes);
router.use('/consumer/foods', consumerFoodRoutes);
router.use('/consumer', consumerDashboardRoutes);
router.use('/consumer/cart', consumerCartRoutes);
router.use('/consumer/coupon', consumerCouponRoutes);
router.use('/consumer/reviews', consumerReviewRoutes);
router.use('/consumer/order', consumerOrderRoutes);
router.use('/consumer/addresses', consumerAddressRoutes);
router.use('/consumer/favourites', consumerFavouriteRoutes);
router.use('/consumer/message', consumerMessageRoutes);
router.use('/consumer', consumerUserRoutes);

//general upload
import uploadRouter from './upload';
import storageRouter from './storage';

//deliveryman
router.use('/delivery-man', dmUserRoutes);
router.use('/delivery-man/orders', dmOrderRoutes);
router.use('/delivery-man/message', dmMessageRoutes);

//admin
router.use('/admin/auth', adminAuthRoutes);
router.use('/admin/vendors', adminVendorRoutes);
router.use('/admin/banners', adminBannerRoutes);
router.use('/admin/zones', adminZoneRoutes);


router.use('/upload', uploadRouter);
router.use('/storage', storageRouter);

export default router;