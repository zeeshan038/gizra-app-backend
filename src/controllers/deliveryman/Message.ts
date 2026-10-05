import { Request, Response } from 'express';
import multer from 'multer';
import {
  dmMessageDetailsQuerySchema,
  dmMessageListQuerySchema,
  dmMessageSearchQuerySchema,
  dmMessageSendSchema,
} from '../../schemas/deliveryman/message';
import {
  listConversationsForUserInfo,
  searchConversationsForUserInfo,
} from '../../utils/chat/conversationQuery';
import { uploadChatImageFile } from '../../utils/chat/chatImageUpload';
import { getDeliveryManMessageDetails } from '../../utils/chat/messageDetails';
import { deliveryManSendMessage } from '../../utils/chat/sendMessage';
import { getOrCreateDeliveryManUserInfo, userInfoId } from '../../utils/chat/userInfo';

const upload = multer({ storage: multer.memoryStorage() });

function requireDeliveryManId(req: Request, res: Response): number | null {
  const id = Number(req.user?.id);
  if (!id) {
    res.status(401).json({ status: false, msg: 'Unauthorized' });
    return null;
  }
  return id;
}

/**
 * @Description Driver conversation inbox (PHP delivery-man/message/list)
 * @Route GET /api/delivery-man/message/list
 */
export const listConversations = async (req: Request, res: Response): Promise<any> => {
  const deliveryManId = requireDeliveryManId(req, res);
  if (deliveryManId == null) return;

  const { error, value } = dmMessageListQuerySchema.validate(req.query, { stripUnknown: true });
  if (error) {
    return res.status(403).json({ errors: [{ code: 'validation', message: error.message }] });
  }

  const sender = await getOrCreateDeliveryManUserInfo(deliveryManId);
  const data = await listConversationsForUserInfo(userInfoId(sender), {
    ownerRole: 'delivery_man',
    type: value.type,
    limit: value.limit,
    page: value.offset,
  });

  return res.status(200).json({
    type: data.type,
    total_size: data.total_size,
    limit: data.limit,
    offset: data.offset,
    conversation: data.conversations,
  });
};

/**
 * @Route GET /api/delivery-man/message/search-list
 */
export const searchConversations = async (req: Request, res: Response): Promise<any> => {
  const deliveryManId = requireDeliveryManId(req, res);
  if (deliveryManId == null) return;

  const { error, value } = dmMessageSearchQuerySchema.validate(req.query, {
    stripUnknown: true,
  });
  if (error) {
    return res.status(403).json({ errors: [{ code: 'validation', message: error.message }] });
  }

  const sender = await getOrCreateDeliveryManUserInfo(deliveryManId);
  const data = await searchConversationsForUserInfo(userInfoId(sender), value.name, {
    ownerRole: 'delivery_man',
    limit: value.limit,
    page: value.offset,
  });

  return res.status(200).json({
    total_size: data.total_size,
    limit: data.limit,
    offset: data.offset,
    conversation: data.conversations,
  });
};

/**
 * @Route GET /api/delivery-man/message/details
 */
export const messageDetails = async (req: Request, res: Response): Promise<any> => {
  const deliveryManId = requireDeliveryManId(req, res);
  if (deliveryManId == null) return;

  const { error, value } = dmMessageDetailsQuerySchema.validate(req.query, {
    stripUnknown: true,
  });
  if (error) {
    return res.status(403).json({ errors: [{ code: 'validation', message: error.message }] });
  }

  const sender = await getOrCreateDeliveryManUserInfo(deliveryManId);
  const result = await getDeliveryManMessageDetails({
    deliveryManUserInfoId: userInfoId(sender),
    deliveryManId,
    conversationId: value.conversation_id,
    customerUserId: value.user_id,
    vendorId: value.vendor_id,
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
 * @Route POST /api/delivery-man/message/send
 */
export const sendMessage = async (req: Request, res: Response): Promise<any> => {
  const deliveryManId = requireDeliveryManId(req, res);
  if (deliveryManId == null) return;

  const { error, value } = dmMessageSendSchema.validate(req.body, { stripUnknown: true });
  if (error) {
    return res.status(403).json({ errors: [{ code: 'validation', message: error.message }] });
  }

  const sender = await getOrCreateDeliveryManUserInfo(deliveryManId);

  try {
    const data = await deliveryManSendMessage({
      deliveryManId,
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
    const status = msg === 'forbidden' || msg === 'conversation_not_found' ? 403 : 400;
    return res.status(status).json({
      errors: [{ code: msg, message: msg.replace(/_/g, ' ') }],
    });
  }
};

export const chatImageMiddleware = upload.single('image');

/**
 * @Route POST /api/delivery-man/message/chat-image
 */
export const chatImage = async (req: Request, res: Response): Promise<any> => {
  if (requireDeliveryManId(req, res) == null) return;

  if (!req.file) {
    return res.status(403).json({ errors: [{ code: 'image', message: 'image is required' }] });
  }
  if (req.file.size > 2 * 1024 * 1024) {
    return res.status(403).json({ errors: [{ code: 'image', message: 'Max file size is 2mb' }] });
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
