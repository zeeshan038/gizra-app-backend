import express from 'express';
const router = express.Router();

import { createBanner, getBanners } from '../../controllers/admin/Banners';
import { verifyAdmin } from '../../middlewares/verifyAdmin';

router.post('/', verifyAdmin, createBanner);
router.get('/', verifyAdmin, getBanners);

export default router;
