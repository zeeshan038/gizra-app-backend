import express from 'express';
import {
  createPosApiKey,
  createPosConnection,
  listPosApiKeys,
  listPosConnections,
  listPosDeliveries,
  replayPosDelivery,
  revokePosApiKey,
  updatePosConnection,
} from '../../controllers/admin/pos';
import { verifyAdmin } from '../../middlewares/verifyAdmin';
import { verifySuperAdmin } from '../../middlewares/verifySuperAdmin';

const router = express.Router();

router.use(verifyAdmin, verifySuperAdmin);

router.post('/api-keys', createPosApiKey);
router.get('/api-keys', listPosApiKeys);
router.post('/api-keys/:id/revoke', revokePosApiKey);

router.post('/connections', createPosConnection);
router.get('/connections', listPosConnections);
router.patch('/connections/:id', updatePosConnection);

router.get('/deliveries', listPosDeliveries);
router.post('/deliveries/:id/replay', replayPosDelivery);

export default router;
