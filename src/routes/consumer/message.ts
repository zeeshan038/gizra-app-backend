import express from 'express';
import {
  chatImage,
  chatImageMiddleware,
  listConversations,
  messageDetails,
  searchConversations,
  sendMessage,
} from '../../controllers/consumer/Message';
import { requireRegisteredConsumer, verifyConsumer } from '../../middlewares/verifyConsumer';

const router = express.Router();

router.use(verifyConsumer);
router.use(requireRegisteredConsumer);

router.get('/list', listConversations);
router.get('/search-list', searchConversations);
router.get('/details', messageDetails);
router.post('/send', sendMessage);
router.post('/chat-image', chatImageMiddleware, chatImage);

export default router;
