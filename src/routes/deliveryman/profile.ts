import express from 'express';
const router = express.Router();

import { getProfile, activeStatus } from '../../controllers/deliveryman/Profile';
import { verifyDeliveryMan } from '../../middlewares/verifyDeliveryMan';

router.use(verifyDeliveryMan);

router.get('/', getProfile);
router.put('/status', activeStatus);

export default router;
