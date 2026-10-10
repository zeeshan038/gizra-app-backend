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
import { toggleConsumerPushNotification } from '../../controllers/notifications/togglePushNotification';

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

const requireCustomer = [verifyConsumer, requireRegisteredConsumer];

router.post('/apply/restaurant', ...requireCustomer, applyForRestaurant);
router.put('/password/change', ...requireCustomer, changePassword);

router.get('/suggested-foods', ...requireCustomer, getSuggestedFoods);
router.put('/update-firebase-token', ...requireCustomer, updateFirebaseToken);
router.put('/update-zone', ...requireCustomer, updateProfileZone);
router.post('/update-interest', ...requireCustomer, updateInterest);
router.get('/whoami', ...requireCustomer, getProfile);
router.get('/info', ...requireCustomer, getProfile);
router.get('/profile', ...requireCustomer, getProfile);
router.put('/update-profile', ...requireCustomer, updateProfile);
router.delete('/delete-account', ...requireCustomer, removeAccount);
router.get('/notifications', ...requireCustomer, getNotifications);
router.put('/notifications/toggle', ...requireCustomer, toggleConsumerPushNotification);
router.delete('/notifications/:id', ...requireCustomer, deleteNotification);

export default router;
