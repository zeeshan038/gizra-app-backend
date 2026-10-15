import express from 'express';
import {
  addAdminDeliveryManBonus,
  approveAllAdminIncentives,
  denyAdminIncentive,
  listAdminDeliveryManBonus,
  listAdminDeliveryManJoinRequests,
  listAdminDeliveryManReviews,
  listAdminDeliveryMen,
  listAdminIncentiveHistory,
  listAdminPendingIncentives,
  selectAdminDeliveryMen,
  updateAdminDeliveryManApplication,
  updateAdminDeliveryManReviewStatus,
  updateAdminDeliveryManStatus,
} from '../../controllers/admin/deliveryman';
import { verifyAdmin } from '../../middlewares/verifyAdmin';

const router = express.Router();
router.use(verifyAdmin);

router.get('/list', listAdminDeliveryMen);
router.get('/join-requests', listAdminDeliveryManJoinRequests);
router.get('/select', selectAdminDeliveryMen);
router.patch('/:id/application', updateAdminDeliveryManApplication);
router.patch('/:id/status', updateAdminDeliveryManStatus);

router.get('/reviews', listAdminDeliveryManReviews);
router.patch('/reviews/:id/status', updateAdminDeliveryManReviewStatus);

router.get('/incentives/pending', listAdminPendingIncentives);
router.get('/incentives/history', listAdminIncentiveHistory);
router.put('/incentives/:id', denyAdminIncentive);
router.post('/incentives/approve-all', approveAllAdminIncentives);

router.get('/bonus', listAdminDeliveryManBonus);
router.post('/bonus', addAdminDeliveryManBonus);

export default router;
