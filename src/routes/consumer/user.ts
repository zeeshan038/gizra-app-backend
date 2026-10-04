import express from 'express';
import { requireRegisteredConsumer, verifyConsumer } from '../../middlewares/verifyConsumer';
import {
  applyForDeliveryMan,
  applyForRestaurant,
  guestRequest,
  login,
  register,
  sendLoginOtp,
  signInWithGoogle,
  verifyLoginOtp,
} from '../../controllers/consumer/User';
import {
  changePassword,
  forgotPassword,
  resetPassword,
  verifyPasswordOtp,
} from '../../controllers/consumer/Password';
import {
  getProfile,
  getSuggestedFoods,
  removeAccount,
  updateFirebaseToken,
  updateInterest,
  updateProfile,
  updateProfileZone,
} from '../../controllers/consumer/Profile';
import {
  deleteNotification,
  getNotifications,
  testNotification,
} from '../../controllers/consumer/notifications';

const router = express.Router();

router.post('/guest/request', guestRequest);
router.post('/register', register);
router.post('/login', login);
router.post('/login/send-otp', sendLoginOtp);
router.post('/login/verify-otp', verifyLoginOtp);
router.post('/sign-in-with-google', signInWithGoogle);
router.post('/apply/delivery-man', applyForDeliveryMan);

router.post('/password/forgot', forgotPassword);
router.post('/password/verify-otp', verifyPasswordOtp);
router.put('/password/reset', resetPassword);
router.post('/notifications/test', testNotification);
router.get('/notifications/test', testNotification);

router.use(verifyConsumer);
router.use(requireRegisteredConsumer);
router.post('/apply/restaurant', applyForRestaurant);
router.put('/password/change', changePassword);

router.get('/suggested-foods', getSuggestedFoods);
router.put('/update-firebase-token', updateFirebaseToken);
router.put('/update-zone', updateProfileZone);
router.post('/update-interest', updateInterest);
router.get('/whoami', getProfile);
router.put('/update-profile', updateProfile);
router.delete('/delete-account', removeAccount);
router.get('/notifications', getNotifications);
router.delete('/notifications/:id', deleteNotification);

export default router;
