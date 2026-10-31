import express from 'express';
import {
  assignHomeCategoryRestaurants,
  createHomeCategory,
  deleteHomeCategory,
  generateHomeCategoryImage,
  getHomeCategoryRestaurants,
  listHomeCategories,
  updateHomeCategory,
} from '../../controllers/admin/HomeCategories';
import { verifyAdmin } from '../../middlewares/verifyAdmin';

const router = express.Router();

router.post('/ai/generate-image', verifyAdmin, generateHomeCategoryImage);
router.get('/', verifyAdmin, listHomeCategories);
router.post('/', verifyAdmin, createHomeCategory);
router.patch('/:id', verifyAdmin, updateHomeCategory);
router.delete('/:id', verifyAdmin, deleteHomeCategory);
router.get('/:id/restaurants', verifyAdmin, getHomeCategoryRestaurants);
router.put('/:id/restaurants', verifyAdmin, assignHomeCategoryRestaurants);

export default router;
