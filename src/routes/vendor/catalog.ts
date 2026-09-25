import express from 'express';
const router = express.Router();

import { createCategory, getCategories } from '../../controllers/vendor/catalog/Category';
import { createFood, getFoods, deleteFood, bulkPublishFoods, bulkDeleteFoods, updateFood } from '../../controllers/vendor/catalog/Food';
import { parsePdf, generateDescription, generateFoodImage, generateCategoryImage } from '../../controllers/vendor/catalog/AI';
import { createAddon, getAddons } from '../../controllers/vendor/catalog/Addon';
import { verifyVendor } from '../../middlewares/verifyVendor';

// Apply verifyVendor to all catalog routes
router.use(verifyVendor);

// Categories
router.post('/category', createCategory);
router.get('/category', getCategories);


router.post('/addon', createAddon);
router.get('/addon', getAddons);

// Foods
router.post('/food', createFood);
router.get('/food', getFoods);
router.patch('/food/:id', updateFood);
router.delete('/food/:id', deleteFood);
router.post('/food/bulk-publish', bulkPublishFoods);
router.post('/food/bulk-delete', bulkDeleteFoods);

// AI Tools
import multer from 'multer';
const upload = multer({ storage: multer.memoryStorage() });

router.post('/ai/parse-pdf', upload.single('file'), parsePdf);
router.post('/ai/description', generateDescription);
router.post('/ai/generate-image', generateFoodImage);
router.post('/ai/generate-category-image', generateCategoryImage);

export default router;
