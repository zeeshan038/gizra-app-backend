//NPM Packages
import express from 'express';

//Middlewares
import { verifyVendor } from '../../middlewares/verifyVendor';

//Controllers
import {
  getOrderCounts,
  getOrderDetails,
  listOrders,
  pollRecentOrders,
  streamVendorOrderEvents,
  updateOrderStatus,
} from '../../controllers/vendor/Order';

const router = express.Router();

router.use(verifyVendor);

router.get('/counts', getOrderCounts);
router.get('/events', streamVendorOrderEvents);
router.get('/recent', pollRecentOrders);
router.get('/', listOrders);
router.get('/:id', getOrderDetails);
router.put('/:id/status', updateOrderStatus);

export default router;
