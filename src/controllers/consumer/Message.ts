import { Request, Response } from 'express';
import multer from 'multer';
import { uploadChatImageFile } from '../../utils/chat/chatImageUpload';
import {
  listConversationsForUserInfo,
  searchConversationsForUserInfo,
} from '../../utils/chat/conversationQuery';
import { getCustomerMessageDetails } from '../../utils/chat/messageDetails';
import { customerSendMessage } from '../../utils/chat/sendMessage';
import { getOrCreateCustomerUserInfo, userInfoId } from '../../utils/chat/userInfo';
import {
  messageDetailsQuerySchema,
  messageListQuerySchema,
  messageSearchQuerySchema,
  messageSendSchema,
} from '../../schemas/consumer/message';

const upload = multer({ storage: multer.memoryStorage() });

function requireRegisteredUserId(req: Request, res: Response): number | null {
  if (req.user?.isGuest) {
    res.status(401).json({
      status: false,
      msg: 'Login required — guest sessions cannot use chat.',
    });
    return null;
  }
  const userId = Number(req.user?.id);
  if (!userId) {
    res.status(401).json({ status: false, msg: 'Unauthorized' });
    return null;
  }
  return userId;
}

/**
 * @Description Conversation inbox (PHP customer/message/list)
 * @Route GET /api/consumer/message/list
 * @Access Consumer (registered)
 */
export const listConversations = async (req: Request, res: Response): Promise<any> => {
  const userId = requireRegisteredUserId(req, res);
  if (userId == null) return;

  const { error, value } = messageListQuerySchema.validate(req.query, { stripUnknown: true });
  if (error) {
    return res.status(403).json({
      errors: [{ code: 'validation', message: error.message }],
    });
  }

  const sender = await getOrCreateCustomerUserInfo(userId);
  const data = await listConversationsForUserInfo(userInfoId(sender), {
    ownerRole: 'customer',
    type: value.type,
    limit: value.limit,
    page: value.offset,
  });
  return res.status(200).json(data);
};

/**
 * @Description Search conversations by participant name
 * @Route GET /api/consumer/message/search-list
 * @Access Consumer (registered)
 */
export const searchConversations = async (req: Request, res: Response): Promise<any> => {
  const userId = requireRegisteredUserId(req, res);
  if (userId == null) return;

  const { error, value } = messageSearchQuerySchema.validate(req.query, { stripUnknown: true });
  if (error) {
    return res.status(403).json({
      errors: [{ code: 'validation', message: error.message }],
    });
  }

  const sender = await getOrCreateCustomerUserInfo(userId);
  const data = await searchConversationsForUserInfo(userInfoId(sender), value.name, {
    ownerRole: 'customer',
    type: value.type,
    limit: value.limit,
    page: value.offset,
  });
  return res.status(200).json(data);
};

/**
 * @Description Thread messages + conversation header
 * @Route GET /api/consumer/message/details
 * @Access Consumer (registered)
 */
export const messageDetails = async (req: Request, res: Response): Promise<any> => {
  const userId = requireRegisteredUserId(req, res);
  if (userId == null) return;

  const { error, value } = messageDetailsQuerySchema.validate(req.query, { stripUnknown: true });
  if (error) {
    return res.status(403).json({
      errors: [{ code: 'validation', message: error.message }],
    });
  }

  const sender = await getOrCreateCustomerUserInfo(userId);
  const result = await getCustomerMessageDetails({
    customerUserInfoId: userInfoId(sender),
    customerUserId: userId,
    conversationId: value.conversation_id,
    vendorId: value.vendor_id,
    deliveryManId: value.delivery_man_id,
    adminId: value.admin_id,
    limit: value.limit,
    page: value.offset,
  });

  if ('forbidden' in result && result.forbidden) {
    return res.status(403).json({
      errors: [{ code: 'forbidden', message: 'You cannot view this conversation' }],
    });
  }

  return res.status(200).json(result);
};

/**
 * @Description Send a chat message (creates conversation when needed)
 * @Route POST /api/consumer/message/send
 * @Access Consumer (registered)
 */
export const sendMessage = async (req: Request, res: Response): Promise<any> => {
  const userId = requireRegisteredUserId(req, res);
  if (userId == null) return;

  const { error, value } = messageSendSchema.validate(req.body, { stripUnknown: true });
  if (error) {
    return res.status(403).json({
      errors: [{ code: 'validation', message: error.message }],
    });
  }

  const sender = await getOrCreateCustomerUserInfo(userId);

  try {
    const data = await customerSendMessage({
      customerUserId: userId,
      senderUserInfoId: userInfoId(sender),
      conversationId: value.conversation_id,
      receiverType: value.receiver_type,
      receiverEntityId: value.receiver_id,
      message: value.message ?? null,
      limit: value.limit,
      page: value.offset,
    });
    return res.status(200).json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'send_failed';
    if (msg === 'forbidden' || msg === 'conversation_not_found') {
      return res.status(403).json({
        errors: [{ code: msg, message: msg.replace(/_/g, ' ') }],
      });
    }
    return res.status(400).json({
      errors: [{ code: msg, message: msg.replace(/_/g, ' ') }],
    });
  }
};

/**
 * @Description Upload a single chat image before sending
 * @Route POST /api/consumer/message/chat-image
 * @Access Consumer (registered)
 */
export const chatImageMiddleware = upload.single('image');

export const chatImage = async (req: Request, res: Response): Promise<any> => {
  const userId = requireRegisteredUserId(req, res);
  if (userId == null) return;

  if (!req.file) {
    return res.status(403).json({
      errors: [{ code: 'image', message: 'image is required' }],
    });
  }

  if (req.file.size > 2 * 1024 * 1024) {
    return res.status(403).json({
      errors: [{ code: 'image', message: 'Max file size is 2mb' }],
    });
  }

  try {
    const result = await uploadChatImageFile(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname
    );
    return res.status(200).json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Upload failed';
    return res.status(500).json({ errors: [{ code: 'upload', message: msg }] });
  }
};
