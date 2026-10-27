import express from 'express';
import {
  hyperPayCheckout,
  hyperPayFailed,
  hyperPaySuccess,
  hyperPayWebhook,
} from '../../controllers/payment/HyperPayController';

const router = express.Router();

router.get('/pay', hyperPayCheckout);
router.all('/success', hyperPaySuccess);
router.all('/failed', hyperPayFailed);
router.all('/notify', hyperPayWebhook);

export default router;
