import express from 'express';
import {
  addAdminDeliveryManBonus,
  approveAllAdminIncentives,
  createAdminDeliveryManHandler,
  denyAdminIncentive,
  getAdminDeliveryManDetailHandler,
  listAdminDeliveryVehicles,
  listAdminDeliveryManBonus,
  listAdminDeliveryManJoinRequests,
  listAdminDeliveryManReviews,
  listAdminDeliveryMen,
  listAdminIncentiveHistory,
  listAdminPendingIncentives,
  selectAdminDeliveryMen,
  updateAdminDeliveryManApplication,
  updateAdminDeliveryManHandler,
  updateAdminDeliveryManReviewStatus,
  updateAdminDeliveryManStatus,
} from '../../controllers/admin/deliveryman';
import { verifyAdmin } from '../../middlewares/verifyAdmin';

const router = express.Router();
router.use(verifyAdmin);

router.get('/vehicles', listAdminDeliveryVehicles);
router.post('/', createAdminDeliveryManHandler);
router.get('/list', listAdminDeliveryMen);
router.get('/join-requests', listAdminDeliveryManJoinRequests);
router.get('/select', selectAdminDeliveryMen);

router.get('/reviews', listAdminDeliveryManReviews);
router.patch('/reviews/:id/status', updateAdminDeliveryManReviewStatus);

router.get('/incentives/pending', listAdminPendingIncentives);
router.get('/incentives/history', listAdminIncentiveHistory);
router.put('/incentives/:id', denyAdminIncentive);
router.post('/incentives/approve-all', approveAllAdminIncentives);

router.get('/bonus', listAdminDeliveryManBonus);
router.post('/bonus', addAdminDeliveryManBonus);

router.get('/:id', getAdminDeliveryManDetailHandler);
router.put('/:id', updateAdminDeliveryManHandler);
router.patch('/:id', updateAdminDeliveryManHandler);
router.patch('/:id/application', updateAdminDeliveryManApplication);
router.patch('/:id/status', updateAdminDeliveryManStatus);

export default router;

