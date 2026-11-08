import express from 'express';
import { getDeliveryManBootstrapConfiguration } from '../../controllers/shared/Configuration';
import { registerPlacesConfigRoutes } from '../shared/placesConfigRoutes';

const router = express.Router();

router.get('/bootstrap', getDeliveryManBootstrapConfiguration);
registerPlacesConfigRoutes(router);

export default router;
