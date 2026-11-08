import express from 'express';
import { getVendorBootstrapConfiguration } from '../../controllers/shared/Configuration';
import { registerPlacesConfigRoutes } from '../shared/placesConfigRoutes';

const router = express.Router();

router.get('/bootstrap', getVendorBootstrapConfiguration);
registerPlacesConfigRoutes(router);

export default router;
