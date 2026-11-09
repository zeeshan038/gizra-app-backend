import express from 'express';
import {
  getAdminMerchantInquiryAlertHandler,
  listAdminMerchantInquiriesHandler,
  markAdminMerchantInquirySeenHandler,
  markAllAdminMerchantInquiriesSeenHandler,
} from '../../controllers/admin/merchantInquiries';
import { verifyAdmin } from '../../middlewares/verifyAdmin';

const router = express.Router();

router.use(verifyAdmin);

router.get('/alert', getAdminMerchantInquiryAlertHandler);
router.post('/mark-all-seen', markAllAdminMerchantInquiriesSeenHandler);
router.patch('/:id/seen', markAdminMerchantInquirySeenHandler);
router.get('/', listAdminMerchantInquiriesHandler);

export default router;
