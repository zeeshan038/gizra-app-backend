import express from 'express';
const router = express.Router();

import { searchFoods } from '../../controllers/consumer/Restaurant';

// Public endpoint for searching foods
router.get('/search', searchFoods);

export default router;
