import express from 'express';
const router = express.Router();

//vendor
import vendorUserRoutes from './vendor/user';
import vendorCatalogRoutes from './vendor/catalog';
//consumer
import consumerUserRoutes from './consumer/user';
//deliveryman
import dmUserRoutes from './deliveryman/user';
import dmProfileRoutes from './deliveryman/profile';
import dmOrderRoutes from './deliveryman/order';

//admin
import adminAuthRoutes from './admin/auth';
import adminVendorRoutes from './admin/vendors';
import adminBannerRoutes from './admin/banners';

//vendor
router.use('/vendor',vendorUserRoutes);
router.use('/vendor/catalog', vendorCatalogRoutes);

//consumer
import consumerCartRoutes from './consumer/cart';
import consumerOrderRoutes from './consumer/order';
import consumerRestaurantRoutes from './consumer/restaurant';
import consumerFoodRoutes from './consumer/food';
import consumerDashboardRoutes from './consumer/dashboard';

//consumer
router.use('/consumer',consumerUserRoutes);
router.use('/consumer/restaurants', consumerRestaurantRoutes);
router.use('/consumer/foods', consumerFoodRoutes);
router.use('/consumer/cart', consumerCartRoutes);
router.use('/consumer', consumerDashboardRoutes);
router.use('/consumer/order', consumerOrderRoutes);

//deliveryman
router.use('/delivery-man', dmUserRoutes);
router.use('/delivery-man/profile', dmProfileRoutes);
router.use('/delivery-man/orders', dmOrderRoutes);

//admin
router.use('/admin/auth', adminAuthRoutes);
router.use('/admin/vendors', adminVendorRoutes);
router.use('/admin/banners', adminBannerRoutes);

export default router;