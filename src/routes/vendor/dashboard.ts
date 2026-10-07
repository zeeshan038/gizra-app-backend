import express from 'express';
import { verifyVendor } from '../../middlewares/verifyVendor';
import {
  getDashboardOrderStats,
  getDashboardTopFoods,
  getDashboardYearlyChart,
} from '../../controllers/vendor/dashboard';

const router = express.Router();

router.use(verifyVendor);

router.get('/order-stats', getDashboardOrderStats);
router.get('/yearly-chart', getDashboardYearlyChart);
router.get('/top-foods', getDashboardTopFoods);

export default router;
