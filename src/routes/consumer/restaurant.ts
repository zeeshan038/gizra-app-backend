import express from 'express';
const router = express.Router();

import {
    getRestaurants,
    getPopularRestaurants,
    getNearbyRestaurants,
    getRestaurantFoods,
    getRestaurantDetails
} from '../../controllers/consumer/Restaurant';

router.get('/popular', getPopularRestaurants);
router.get('/nearby', getNearbyRestaurants);
router.get('/all', getRestaurants);
router.get('/:id/foods', getRestaurantFoods);
router.get('/specfic/:id', getRestaurantDetails);

export default router;
