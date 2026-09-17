import express from 'express';
const router = express.Router();
import { login } from '../../controllers/admin/admin';

router.post('/login', login);

export default router;
