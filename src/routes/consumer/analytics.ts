import express from 'express';
import { trackAnalyticsEvents } from '../../controllers/consumer/Analytics';
import { verifyConsumer } from '../../middlewares/verifyConsumer';

const router = express.Router();

router.post('/events', verifyConsumer, trackAnalyticsEvents);

export default router;
