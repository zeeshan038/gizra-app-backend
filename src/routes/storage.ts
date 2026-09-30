import express from 'express';
import { registrationInit } from '../controllers/storage/Registration';

const router = express.Router();

router.post('/registration-init', registrationInit);

export default router;
