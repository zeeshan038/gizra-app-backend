import express from 'express';
import { verifyVendor } from '../../middlewares/verifyVendor';
import { getDispatchDeliveryFeeQuote, requestDriver } from '../../controllers/vendor/Dispatch';

const router = express.Router();

router.use(verifyVendor);
router.get('/delivery-fee', getDispatchDeliveryFeeQuote);
router.post('/request-driver', requestDriver);

export default router;
