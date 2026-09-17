import express from 'express';
const router = express.Router();

import { getRestaurants, getRestaurantFoods } from '../../controllers/consumer/Restaurant';

// Note: These endpoints are public (no authentication required) so guests can browse the catalog
router.get('/all', getRestaurants);
router.get('/:id/foods', getRestaurantFoods);

export default router;
