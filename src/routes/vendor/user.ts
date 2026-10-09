import express from 'express';
const router = express.Router();
import {
  changePassword,
  forgotPassword,
  login,
  sendLoginOtp,
  verifyLoginOtp,
  register,
  resetPassword,
  updateFcmToken,
  verifyPasswordOtp,
  whoami,
} from '../../controllers/vendor/user';
import { verifyVendor } from '../../middlewares/verifyVendor';
import {
  deleteNotification,
  getNotifications,
} from '../../controllers/vendor/notification';
import { toggleVendorPushNotification } from '../../controllers/notifications/togglePushNotification';

router.post('/login', login);
router.post('/login/send-otp', sendLoginOtp);
router.post('/login/verify-otp', verifyLoginOtp);
router.post('/register', register);

router.post('/password/forgot', forgotPassword);
router.post('/password/verify-otp', verifyPasswordOtp);
router.put('/password/reset', resetPassword);

router.use(verifyVendor);
router.get('/whoami', whoami);
router.put('/password/change', changePassword);
router.get('/notifications', getNotifications);
router.put('/notifications/toggle', toggleVendorPushNotification);
router.delete('/notifications/:id', deleteNotification);
router.put('/fcm-token', updateFcmToken);

export default router;
