import express from 'express';
import {
  bulkDeliveryManDisbursementStatus,
  getDeliveryManDisbursement,
  listDeliveryManDisbursements,
  patchDeliveryManDisbursementDetailStatus,
} from '../../controllers/admin/driverDisbursment';
import {
  bulkRestaurantDisbursementStatus,
  getRestaurantDisbursement,
  listRestaurantDisbursements,
  patchRestaurantDisbursementDetailStatus,
} from '../../controllers/admin/restaurantDisbursment';
import { verifyAdmin } from '../../middlewares/verifyAdmin';

const router = express.Router();
router.use(verifyAdmin);

const restaurantRouter = express.Router();
restaurantRouter.get('/list', listRestaurantDisbursements);
restaurantRouter.get('/:id', getRestaurantDisbursement);
restaurantRouter.patch('/details/:detailId/status', patchRestaurantDisbursementDetailStatus);
restaurantRouter.post('/details/bulk-status', bulkRestaurantDisbursementStatus);

const dmRouter = express.Router();
dmRouter.get('/list', listDeliveryManDisbursements);
dmRouter.get('/:id', getDeliveryManDisbursement);
dmRouter.patch('/details/:detailId/status', patchDeliveryManDisbursementDetailStatus);
dmRouter.post('/details/bulk-status', bulkDeliveryManDisbursementStatus);

router.use('/restaurant', restaurantRouter);
router.use('/delivery-man', dmRouter);

export default router;
