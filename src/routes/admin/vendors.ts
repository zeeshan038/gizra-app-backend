import express from 'express';
const router = express.Router();
import { approveVendor } from '../../controllers/admin/vendors';
import { verifyAdmin } from '../../middlewares/verifyAdmin';

router.use(verifyAdmin);

router.put('/approve/:vendor_id', approveVendor);

export default router;
