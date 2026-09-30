import express from 'express';
import {
  changePassword,
  forgotPassword,
  login,
  register,
  resetPassword,
  verifyPasswordOtp,
  whoami,
} from '../../controllers/deliveryman/User';
import { activeStatus, getProfile } from '../../controllers/deliveryman/Profile';
import { getHome } from '../../controllers/deliveryman/Home';
import { getEarnings } from '../../controllers/deliveryman/earnings';
import { verifyDeliveryMan } from '../../middlewares/verifyDeliveryMan';

const router = express.Router();

router.post('/login', login);
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
router.put('/profile/status', activeStatus);

export default router;
