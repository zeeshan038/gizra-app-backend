import express from 'express';
import {
  posAcceptOrder,
  posGetOrder,
  posListOrders,
  posRejectOrder,
} from '../../controllers/pos/orders';
import { verifyPosPartner } from '../../middlewares/verifyPosPartner';

const router = express.Router();

router.use(verifyPosPartner);

router.get('/', posListOrders);
router.get('/:id', posGetOrder);
router.post('/:id/accept', posAcceptOrder);
router.post('/:id/reject', posRejectOrder);

export default router;
