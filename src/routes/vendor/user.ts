import express from 'express';
const router = express.Router();
// @ts-ignore
import {login, register} from '../../controllers/vendor/User';

router.post('/login',login);
router.post('/register',register);

export default router;