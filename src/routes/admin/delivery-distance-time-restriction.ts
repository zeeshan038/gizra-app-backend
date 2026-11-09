import express from 'express';
import { verifyAdmin } from '../../middlewares/verifyAdmin';
import { verifySuperAdmin } from '../../middlewares/verifySuperAdmin';
import {
  getDeliveryDistanceTimeRestriction,
  putDeliveryDistanceTimeRestriction,
} from '../../controllers/admin/deliveryDistanceTimeRestriction';

const router = express.Router();

router.use(verifyAdmin);
router.use(verifySuperAdmin);

router.get('/', getDeliveryDistanceTimeRestriction);
router.put('/', putDeliveryDistanceTimeRestriction);

export default router;
