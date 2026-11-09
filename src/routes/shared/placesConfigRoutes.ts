import { Router } from 'express';
import {
  getDistance,
  getGeocode,
  getPlaceAutocomplete,
  getPlaceDetails,
} from '../../controllers/consumer/Places';

/** Google Places / distance proxies — same handlers for consumer, vendor, and delivery-man config mounts. */
export function registerPlacesConfigRoutes(router: Router): void {
  router.get('/place-autocomplete', getPlaceAutocomplete);
  router.get('/place-details', getPlaceDetails);
  router.get('/geocode', getGeocode);
  router.get('/distance', getDistance);
}
