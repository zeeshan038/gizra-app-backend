import express from 'express';
import {
  adminGetDispatchDeliveryFeeQuote,
  adminRequestDriver,
} from '../../controllers/admin/dispatch';
import { verifyAdmin } from '../../middlewares/verifyAdmin';

const router = express.Router();

router.use(verifyAdmin);
router.get('/delivery-fee', adminGetDispatchDeliveryFeeQuote);
router.post('/request-driver', adminRequestDriver);

export default router;
