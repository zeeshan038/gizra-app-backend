import express from 'express';
import { getDeliveryManBootstrapConfiguration } from '../../controllers/shared/Configuration';

const router = express.Router();

router.get('/bootstrap', getDeliveryManBootstrapConfiguration);

export default router;
