import express from 'express';
const router = express.Router();
import {
  changePassword,
  forgotPassword,
  login,
  register,
  resetPassword,
  verifyPasswordOtp,
} from '../../controllers/vendor/user';
import { verifyVendor } from '../../middlewares/verifyVendor';

router.post('/login', login);
router.post('/register', register);

router.post('/password/forgot', forgotPassword);
router.post('/password/verify-otp', verifyPasswordOtp);
router.put('/password/reset', resetPassword);

router.use(verifyVendor);
router.put('/password/change', changePassword);

export default router;
