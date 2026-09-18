import express from 'express';
const router = express.Router();

import {
    getRestaurants,
    getRestaurantFoods,
    getRestaurantDetails
} from '../../controllers/consumer/Restaurant';

router.get('/all', getRestaurants);
router.get('/:id/foods', getRestaurantFoods);
router.get('/specfic/:id', getRestaurantDetails);

export default router;
