import express from 'express';
const router = express.Router();
import { approveVendor, listVendors } from '../../controllers/admin/vendors';
import { verifyAdmin } from '../../middlewares/verifyAdmin';

router.use(verifyAdmin);

router.get('/list', listVendors);
router.put('/approve/:vendor_id', approveVendor);

export default router;
