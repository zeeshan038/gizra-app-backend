import express from 'express';
import { adminRequestDriver } from '../../controllers/admin/dispatch';
import { verifyAdmin } from '../../middlewares/verifyAdmin';

const router = express.Router();

router.use(verifyAdmin);
router.post('/request-driver', adminRequestDriver);

export default router;
