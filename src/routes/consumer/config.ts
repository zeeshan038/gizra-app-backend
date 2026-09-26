import express from 'express';
import { getZoneIdFromCoordinates } from '../../controllers/consumer/Zone';

const router = express.Router();

router.get('/zone-id', getZoneIdFromCoordinates);

export default router;
