import express from 'express';
import {
  adminAbandonedCartsList,
  adminAnalyticsEventsSummary,
  adminAnalyticsFunnel,
} from '../../controllers/admin/analytics';
import { verifyAdmin } from '../../middlewares/verifyAdmin';

const router = express.Router();
router.use(verifyAdmin);

router.get('/funnel', adminAnalyticsFunnel);
router.get('/events/summary', adminAnalyticsEventsSummary);
router.get('/abandoned-carts', adminAbandonedCartsList);

export default router;
