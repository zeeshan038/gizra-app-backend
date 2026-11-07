import express from 'express';
import { getVendorBootstrapConfiguration } from '../../controllers/shared/Configuration';

const router = express.Router();

router.get('/bootstrap', getVendorBootstrapConfiguration);

export default router;
