import express from 'express';
import { getConsumerAppConfiguration } from '../../controllers/shared/Configuration';
import { getZoneIdFromCoordinates } from '../../controllers/consumer/Zone';
import {
  getDistance,
  getExtraCharge,
  getGeocode,
  getOfflinePaymentMethods,
  getPaymentMethods,
  getPlaceAutocomplete,
  getPlaceDetails,
  getVehicles,
} from '../../controllers/consumer/Places';
import { getDeliveryFeeQuote } from '../../controllers/consumer/DeliveryFee';

const router = express.Router();

router.get('/', getConsumerAppConfiguration);
router.get('/zone-id', getZoneIdFromCoordinates);
router.get('/place-autocomplete', getPlaceAutocomplete);
router.get('/distance', getDistance);
router.get('/delivery-fee', getDeliveryFeeQuote);
router.get('/place-details', getPlaceDetails);
router.get('/geocode', getGeocode);
router.get('/extra-charge', getExtraCharge);
router.get('/vehicles', getVehicles);
router.get('/payment-methods', getPaymentMethods);
router.get('/offline-payment-methods', getOfflinePaymentMethods);

export default router;
