import express from 'express';
import { verifyAdmin } from '../../middlewares/verifyAdmin';
import { verifySuperAdmin } from '../../middlewares/verifySuperAdmin';
import {
  getEmergencyServicePause,
  putEmergencyServicePause,
} from '../../controllers/admin/emergencyServicePause';

const router = express.Router();

router.use(verifyAdmin);
router.use(verifySuperAdmin);

router.get('/', getEmergencyServicePause);
router.put('/', putEmergencyServicePause);

export default router;
