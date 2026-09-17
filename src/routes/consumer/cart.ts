import express from 'express';
const router = express.Router();

import { getCart, addToCart, updateCart, removeCartItem, clearCart } from '../../controllers/consumer/Cart';
import { verifyConsumer } from '../../middlewares/verifyConsumer';

// Note: Guest users might not have a token. We apply middleware but make it optional if role is empty?
// Wait, the user said "make all api's authorized". So we will just secure it for logged in users.
router.use(verifyConsumer);

// Cart endpoints
router.get('/', getCart);
router.post('/add', addToCart);
router.put('/update', updateCart);
router.delete('/remove-item/:id', removeCartItem);
router.delete('/clear/:user_id', clearCart);

export default router;
