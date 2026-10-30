import express from 'express';
const router = express.Router();

import { createCategory, getCategories, updateCategory } from '../../controllers/vendor/catalog/Category';
import {
    createFood,
    getFoods,
    deleteFood,
    bulkPublishFoods,
    bulkDeleteFoods,
    updateFood,
    publishAllDraftFoods,
    getFoodPublishQuotaHandler,
} from '../../controllers/vendor/catalog/Food';
import { parsePdf, generateDescription, generateFoodImage, generateCategoryImage } from '../../controllers/vendor/catalog/AI';
import { createAddon, getAddons } from '../../controllers/vendor/catalog/Addon';
import { verifyVendor } from '../../middlewares/verifyVendor';

// Apply verifyVendor to all catalog routes
router.use(verifyVendor);

// Categories
router.post('/category', createCategory);
router.get('/category', getCategories);
router.patch('/category/:id', updateCategory);


router.post('/addon', createAddon);
router.get('/addon', getAddons);

// Foods
router.post('/food', createFood);
router.get('/food', getFoods);
router.patch('/food/:id', updateFood);
router.delete('/food/:id', deleteFood);
router.get('/food/publish-quota', getFoodPublishQuotaHandler);
router.post('/food/publish-all-drafts', publishAllDraftFoods);
router.post('/food/bulk-publish', bulkPublishFoods);
router.post('/food/bulk-delete', bulkDeleteFoods);

// AI Tools
import multer from 'multer';
const upload = multer({ storage: multer.memoryStorage() });

router.post(
    '/ai/parse-pdf',
    (req, res, next) => {
        req.setTimeout(600_000);
        res.setTimeout(600_000);
        next();
    },
    upload.single('file'),
    parsePdf
);
router.post('/ai/description', generateDescription);
router.post('/ai/generate-image', generateFoodImage);
router.post('/ai/generate-category-image', generateCategoryImage);

export default router;
