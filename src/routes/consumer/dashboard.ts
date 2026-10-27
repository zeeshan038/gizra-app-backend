import express from 'express';
const router = express.Router();

import { getHomeCategories, getHomeSlider } from '../../controllers/consumer/Dashboard';

router.get('/home-slider', getHomeSlider);
router.get('/categories', getHomeCategories);

export default router;
