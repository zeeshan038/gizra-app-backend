import express from 'express';
const router = express.Router();
import {
  changePassword,
  forgotPassword,
  login,
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

router.post('/login', login);
router.post('/register', register);

router.post('/password/forgot', forgotPassword);
router.post('/password/verify-otp', verifyPasswordOtp);
router.put('/password/reset', resetPassword);

router.use(verifyVendor);
router.get('/whoami', whoami);
router.put('/password/change', changePassword);
router.get('/notifications', getNotifications);
router.delete('/notifications/:id', deleteNotification);
router.put('/fcm-token', updateFcmToken);

export default router;
