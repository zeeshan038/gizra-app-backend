import express from 'express';
import { getAdminDashboard } from '../../controllers/admin/dashboard';
import { verifyAdmin } from '../../middlewares/verifyAdmin';

const router = express.Router();

router.use(verifyAdmin);
router.get('/', getAdminDashboard);

export default router;
