import express from 'express';
import {
  checkConsumerZone,
  getZoneIdFromCoordinates,
  listConsumerZones,
} from '../../controllers/consumer/Zone';

const router = express.Router();

router.get('/list', listConsumerZones);
router.get('/check', checkConsumerZone);

export default router;
