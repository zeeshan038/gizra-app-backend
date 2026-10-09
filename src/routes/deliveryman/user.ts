import express from 'express';
import {
  changePassword,
  forgotPassword,
  login,
  sendLoginOtp,
  verifyLoginOtp,
  register,
  resetPassword,
  verifyPasswordOtp,
  whoami,
  updateFcmToken,
} from '../../controllers/deliveryman/User';
import { deleteNotification, getNotifications } from '../../controllers/deliveryman/notification';
import { toggleDeliveryManPushNotification } from '../../controllers/notifications/togglePushNotification';
import { activeStatus, getProfile, updateProfile } from '../../controllers/deliveryman/Profile';
import { getHome } from '../../controllers/deliveryman/Home';
import { getEarnings } from '../../controllers/deliveryman/earnings';
import { verifyDeliveryMan } from '../../middlewares/verifyDeliveryMan';

const router = express.Router();

router.post('/login', login);
router.post('/login/send-otp', sendLoginOtp);
router.post('/login/verify-otp', verifyLoginOtp);
router.post('/register', register);
router.post('/password/forgot', forgotPassword);
router.post('/password/verify-otp', verifyPasswordOtp);
router.put('/password/reset', resetPassword);

router.use(verifyDeliveryMan);
router.put('/password/change', changePassword);
router.get('/home', getHome);
router.get('/earnings', getEarnings);
router.get('/whoami', whoami);
router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.put('/update-profile', updateProfile);
router.put('/profile/status', activeStatus);
router.put('/fcm-token', updateFcmToken);
router.get('/notifications', getNotifications);
router.put('/notifications/toggle', toggleDeliveryManPushNotification);
router.delete('/notifications/:id', deleteNotification);

export default router;
