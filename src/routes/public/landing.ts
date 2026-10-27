import express from 'express';
import { submitMerchantInquiry } from '../../controllers/public/MerchantInquiry';

const router = express.Router();

router.post('/merchant-inquiry', submitMerchantInquiry);

export default router;
