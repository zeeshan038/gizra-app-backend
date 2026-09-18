import express from 'express';
const router = express.Router();

import { getHomeSlider } from '../../controllers/consumer/Dashboard';

router.get('/home-slider', getHomeSlider);

export default router;
