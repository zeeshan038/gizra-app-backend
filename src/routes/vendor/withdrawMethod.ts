import express from 'express';
import { verifyVendor } from '../../middlewares/verifyVendor';
import {
  deleteVendorWithdrawMethod,
  listAvailableWithdrawMethodTemplates,
  listVendorWithdrawMethods,
  setVendorWithdrawMethodDefault,
  storeVendorWithdrawMethod,
} from '../../controllers/vendor/WithdrawMethod';

const router = express.Router();

router.use(verifyVendor);

router.get('/available', listAvailableWithdrawMethodTemplates);
router.get('/', listVendorWithdrawMethods);
router.post('/', storeVendorWithdrawMethod);
router.patch('/default', setVendorWithdrawMethodDefault);
router.delete('/:id', deleteVendorWithdrawMethod);

export default router;
