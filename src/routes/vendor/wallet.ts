import express from 'express';
import { verifyVendor } from '../../middlewares/verifyVendor';
import {
  cancelVendorWithdraw,
  getVendorWallet,
  getVendorWithdrawMethodOptions,
  requestVendorWithdraw,
} from '../../controllers/vendor/Wallet';

const router = express.Router();

router.use(verifyVendor);

router.get('/', getVendorWallet);
router.get('/withdraw-method-options', getVendorWithdrawMethodOptions);
router.post('/withdraw-request', requestVendorWithdraw);
router.delete('/withdraw-request/:id', cancelVendorWithdraw);

export default router;
