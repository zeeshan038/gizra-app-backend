import express from 'express';
const router = express.Router();

import {
  getHomeCategories,
  getHomeCategoryRestaurants,
  getHomeSlider,
} from '../../controllers/consumer/Dashboard';

router.get('/home-slider', getHomeSlider);
router.get('/categories/:id/restaurants', getHomeCategoryRestaurants);
router.get('/categories', getHomeCategories);

export default router;
