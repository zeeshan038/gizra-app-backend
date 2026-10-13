import express from 'express';
const router = express.Router();

import {
  getFoodDetails,
  getLatestFoods,
  getMostReviewedFoods,
  getPopularFoods,
  getRecommendedFoods,
  getRelatedFoods,
  getRestaurantPopularFoods,
  getSetMenuFoods,
  searchFoodsWithFilters,
} from '../../controllers/consumer/Food';

router.get('/search', searchFoodsWithFilters);
router.get('/latest', getLatestFoods);
router.get('/popular', getPopularFoods);
router.get('/most-reviewed', getMostReviewedFoods);
router.get('/recommended', getRecommendedFoods);
router.get('/restaurant-popular', getRestaurantPopularFoods);
router.get('/set-menu', getSetMenuFoods);
router.get('/related/:food_id', getRelatedFoods);
router.get('/details/:id', getFoodDetails);

export default router;
