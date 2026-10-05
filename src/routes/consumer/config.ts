import express from 'express';
import { getConsumerAppConfiguration } from '../../controllers/shared/Configuration';
import { getZoneIdFromCoordinates } from '../../controllers/consumer/Zone';

const router = express.Router();

router.get('/', getConsumerAppConfiguration);
router.get('/zone-id', getZoneIdFromCoordinates);

export default router;
