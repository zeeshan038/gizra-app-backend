import express from 'express';
import { getCuisineRestaurants, getCuisines } from '../../controllers/consumer/Marketing';

const router = express.Router();
router.get('/', getCuisines);
router.get('/restaurants', getCuisineRestaurants);
export default router;
