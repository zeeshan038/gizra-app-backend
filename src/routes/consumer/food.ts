import express from 'express';
const router = express.Router();

import { searchFoods } from '../../controllers/consumer/Restaurant';

router.get('/search', searchFoods);

export default router;
