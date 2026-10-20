import express from 'express';
import { verifyVendor } from '../../middlewares/verifyVendor';
import {
  addRestaurantSchedule,
  getRestaurantSetup,
  removeRestaurantSchedule,
  updatePosAppSettings,
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
router.put('/pos-settings', updatePosAppSettings);
router.post('/schedules', addRestaurantSchedule);
router.delete('/schedules/:scheduleId', removeRestaurantSchedule);

export default router;
