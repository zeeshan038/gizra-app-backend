import express from 'express';
const router = express.Router();

import {
    getRestaurants,
    getPopularRestaurants,
    getNearbyRestaurants,
    getDiscoverMapRestaurants,
    getRestaurantFoods,
    getRestaurantDetails,
    getRestaurantMenuCategories,
} from '../../controllers/consumer/Restaurant';
import {
    getDineInRestaurants,
    getRecentlyViewedRestaurants,
    getRecommendedRestaurants,
    getRestaurantCoupons,
    getVisitedRestaurants,
    searchRestaurants,
} from '../../controllers/consumer/RestaurantExtras';
import { optionalVerifyConsumer, verifyConsumer } from '../../middlewares/verifyConsumer';

router.get('/popular', getPopularRestaurants);
router.get('/nearby', getNearbyRestaurants);
router.get('/discover/map', getDiscoverMapRestaurants);
router.get('/all', getRestaurants);
router.get('/search', searchRestaurants);
router.get('/dine-in', getDineInRestaurants);
router.get('/recommended', getRecommendedRestaurants);
router.get('/coupons', getRestaurantCoupons);
router.get('/recently-viewed', verifyConsumer, getRecentlyViewedRestaurants);
router.get('/visit-again', verifyConsumer, getVisitedRestaurants);
router.get('/:id/categories', getRestaurantMenuCategories);
router.get('/:id/foods', getRestaurantFoods);
router.get('/specfic/:id', optionalVerifyConsumer, getRestaurantDetails);
router.get('/specific/:id', optionalVerifyConsumer, getRestaurantDetails);
router.get('/:id', optionalVerifyConsumer, getRestaurantDetails);

export default router;
