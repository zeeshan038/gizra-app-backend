import express from 'express';
import posOrderRoutes from './orders';

const router = express.Router();

router.use('/orders', posOrderRoutes);

export default router;
