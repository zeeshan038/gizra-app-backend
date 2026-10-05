import express from 'express';
import {
  chatImage,
  chatImageMiddleware,
  listConversations,
  messageDetails,
  searchConversations,
  sendMessage,
} from '../../controllers/vendor/Message';
import { verifyVendor } from '../../middlewares/verifyVendor';

const router = express.Router();

router.use(verifyVendor);

router.get('/list', listConversations);
router.get('/search-list', searchConversations);
router.get('/details', messageDetails);
router.post('/send', sendMessage);
router.post('/chat-image', chatImageMiddleware, chatImage);

export default router;
