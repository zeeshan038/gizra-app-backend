import express from 'express';
import { sendAdminPushNotification } from '../../controllers/admin/pushNotifications';
import { verifyAdmin } from '../../middlewares/verifyAdmin';

const router = express.Router();
router.use(verifyAdmin);

router.post('/', sendAdminPushNotification);

export default router;
