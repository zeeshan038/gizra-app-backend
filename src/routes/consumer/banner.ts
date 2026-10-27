import express from 'express';
import { getBanners } from '../../controllers/consumer/Marketing';

const router = express.Router();
router.get('/', getBanners);
export default router;
