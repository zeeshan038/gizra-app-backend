import express from 'express';
import { verifyVendor } from '../../middlewares/verifyVendor';
import {
  addRestaurantSchedule,
  getRestaurantSetup,
  removeRestaurantSchedule,
  updateRestaurantActive,
  updateRestaurantMeta,
  updateRestaurantSetup,
  updateRestaurantToggle,
} from '../../controllers/vendor/RestaurantSetup';

const router = express.Router();

router.use(verifyVendor);

router.get('/business-setup', getRestaurantSetup);
router.put('/business-setup', updateRestaurantSetup);
router.put('/active-status', updateRestaurantActive);
router.put('/setting-toggle', updateRestaurantToggle);
router.put('/meta-data', updateRestaurantMeta);
router.post('/schedules', addRestaurantSchedule);
router.delete('/schedules/:scheduleId', removeRestaurantSchedule);

export default router;
