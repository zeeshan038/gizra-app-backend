import express from 'express';
import { getAdvertisements } from '../../controllers/consumer/Marketing';

const router = express.Router();
router.get('/', getAdvertisements);
export default router;
