//NPM Packages
import express from 'express';
const router = express.Router();

import {
    getCart,
    addToCart,
    updateCart,
    removeCartItem,
    clearCart
} from '../../controllers/consumer/Cart';
import { verifyConsumer } from '../../middlewares/verifyConsumer';


router.use(verifyConsumer);

// Cart endpoints
router.get('/', getCart);
router.post('/add', addToCart);
router.put('/update', updateCart);
router.delete('/remove-item/:id', removeCartItem);
router.delete('/clear/:user_id', clearCart);

export default router;
