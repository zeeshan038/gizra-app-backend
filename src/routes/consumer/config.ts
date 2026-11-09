import express from 'express';
import {
  getConsumerAppConfiguration,
  getConsumerBootstrapConfiguration,
} from '../../controllers/shared/Configuration';
import { getZoneIdFromCoordinates } from '../../controllers/consumer/Zone';
import {
  getExtraCharge,
  getOfflinePaymentMethods,
  getPaymentMethods,
  getVehicles,
} from '../../controllers/consumer/Places';
import { getDeliveryFeeQuote } from '../../controllers/consumer/DeliveryFee';
import { getConsumerEmergencyServicePause } from '../../controllers/consumer/EmergencyServicePause';
import { registerPlacesConfigRoutes } from '../shared/placesConfigRoutes';

const router = express.Router();

router.get('/bootstrap', getConsumerBootstrapConfiguration);
router.get('/emergency-service-pause', getConsumerEmergencyServicePause);
router.get('/', getConsumerAppConfiguration);
router.get('/zone-id', getZoneIdFromCoordinates);
registerPlacesConfigRoutes(router);
router.get('/delivery-fee', getDeliveryFeeQuote);
router.get('/extra-charge', getExtraCharge);
router.get('/vehicles', getVehicles);
router.get('/payment-methods', getPaymentMethods);
router.get('/offline-payment-methods', getOfflinePaymentMethods);

export default router;
