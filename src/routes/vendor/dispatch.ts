import express from 'express';
import { verifyVendor } from '../../middlewares/verifyVendor';
import { requestDriver } from '../../controllers/vendor/Dispatch';

const router = express.Router();

router.use(verifyVendor);
router.post('/request-driver', requestDriver);

export default router;
