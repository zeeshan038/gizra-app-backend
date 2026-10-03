import express from 'express';
import prisma from '../config/database';

const router = express.Router();

async function pingDb(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}

router.get('/health/db', async (_req, res) => {
  try {
    await pingDb();
    return res.status(200).json({ status: true, db: 'ok' });
  } catch (err) {
    try {
      await prisma.$disconnect();
      await prisma.$connect();
      await pingDb();
      return res.status(200).json({ status: true, db: 'ok' });
    } catch (retryErr) {
      console.error('[health/db]', retryErr);
      return res.status(503).json({ status: false, db: 'unavailable' });
    }
  }
});

//vendor
import vendorUserRoutes from './vendor/user';
import vendorCatalogRoutes from './vendor/catalog';
import vendorOrderRoutes from './vendor/order';
import vendorRestaurantRoutes from './vendor/restaurant';
import vendorShopRoutes from './vendor/shop';
//consumer
import consumerUserRoutes from './consumer/user';
//deliveryman
import dmUserRoutes from './deliveryman/user';
import dmOrderRoutes from './deliveryman/order';

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

//consumer
import consumerCartRoutes from './consumer/cart';
import consumerOrderRoutes from './consumer/order';
import consumerRestaurantRoutes from './consumer/restaurant';
import consumerFoodRoutes from './consumer/food';
import consumerDashboardRoutes from './consumer/dashboard';
import consumerAddressRoutes from './consumer/address';
import consumerFavouriteRoutes from './consumer/favourite';
import consumerZoneRoutes from './consumer/zone';
import consumerConfigRoutes from './consumer/config';

//consumer — public discover/config first; `/consumer` user router last (it applies verifyConsumer to unmatched paths)
router.use('/consumer/config', consumerConfigRoutes);
router.use('/consumer/zone', consumerZoneRoutes);
router.use('/consumer/restaurants', consumerRestaurantRoutes);
router.use('/consumer/foods', consumerFoodRoutes);
router.use('/consumer', consumerDashboardRoutes);
router.use('/consumer/cart', consumerCartRoutes);
router.use('/consumer/order', consumerOrderRoutes);
router.use('/consumer/addresses', consumerAddressRoutes);
router.use('/consumer/favourites', consumerFavouriteRoutes);
router.use('/consumer', consumerUserRoutes);

//general upload
import uploadRouter from './upload';
import storageRouter from './storage';

//deliveryman
router.use('/delivery-man', dmUserRoutes);
router.use('/delivery-man/orders', dmOrderRoutes);

//admin
router.use('/admin/auth', adminAuthRoutes);
router.use('/admin/vendors', adminVendorRoutes);
router.use('/admin/banners', adminBannerRoutes);
router.use('/admin/zones', adminZoneRoutes);


router.use('/upload', uploadRouter);
router.use('/storage', storageRouter);

export default router;