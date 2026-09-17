//NPM Packages
import express from 'express';
const router = express.Router();


//Controllers
import { register, login, guestRequest } from '../../controllers/consumer/User';

// Guest Endpoints
router.post('/guest/request', guestRequest);

// Auth Endpoints
router.post('/register', register);
router.post('/login', login);

export default router;
