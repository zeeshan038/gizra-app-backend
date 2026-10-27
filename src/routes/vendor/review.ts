import express from 'express';
import { verifyVendor } from '../../middlewares/verifyVendor';
import { listVendorReviews, replyToVendorReview } from '../../controllers/vendor/Review';

const router = express.Router();

router.use(verifyVendor);

router.get('/', listVendorReviews);
router.put('/:id/reply', replyToVendorReview);

export default router;
