import express from 'express';
import { getAppConfiguration } from '../controllers/shared/Configuration';

const router = express.Router();

router.get('/', getAppConfiguration);

export default router;
