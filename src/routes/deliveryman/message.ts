import express from 'express';
import {
  chatImage,
  chatImageMiddleware,
  listConversations,
  messageDetails,
  searchConversations,
  sendMessage,
} from '../../controllers/deliveryman/Message';
import { verifyDeliveryMan } from '../../middlewares/verifyDeliveryMan';

const router = express.Router();

router.use(verifyDeliveryMan);

router.get('/list', listConversations);
router.get('/search-list', searchConversations);
router.get('/details', messageDetails);
router.post('/send', sendMessage);
router.post('/chat-image', chatImageMiddleware, chatImage);

export default router;
