import express from 'express';
import { verifyConsumer } from '../../middlewares/verifyConsumer';
import {
  createAddress,
  deleteAddress,
  listAddresses,
  updateAddress,
} from '../../controllers/consumer/Address';

const router = express.Router();

router.use(verifyConsumer);

router.get('/', listAddresses);
router.post('/', createAddress);
router.put('/:id', updateAddress);
router.delete('/:id', deleteAddress);

export default router;
