import express from 'express';
import {
  assignRestaurantZone,
  createAdminZone,
  getAdminZone,
  listAdminZones,
  updateAdminZone,
} from '../../controllers/admin/zones';
import { verifyAdmin } from '../../middlewares/verifyAdmin';

const router = express.Router();

router.use(verifyAdmin);

router.get('/list', listAdminZones);
router.post('/create', createAdminZone);
router.put('/restaurant/:restaurantId', assignRestaurantZone);
router.get('/detail/:id', getAdminZone);
router.put('/update/:id', updateAdminZone);

export default router;
