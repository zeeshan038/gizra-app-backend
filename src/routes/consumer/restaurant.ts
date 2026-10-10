import express from 'express';
const router = express.Router();

import {
    getRestaurants,
    getPopularRestaurants,
    getNearbyRestaurants,
    getDiscoverMapRestaurants,
    getRestaurantFoods,
    getRestaurantDetails
} from '../../controllers/consumer/Restaurant';

router.get('/popular', getPopularRestaurants);
router.get('/nearby', getNearbyRestaurants);
router.get('/discover/map', getDiscoverMapRestaurants);
router.get('/all', getRestaurants);
router.get('/:id/foods', getRestaurantFoods);
router.get('/specfic/:id', getRestaurantDetails);
router.get('/specific/:id', getRestaurantDetails);
router.get('/:id', getRestaurantDetails);

export default router;
