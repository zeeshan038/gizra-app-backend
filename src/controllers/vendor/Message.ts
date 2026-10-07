import { Request, Response } from 'express';
import multer from 'multer';
import {
  vendorMessageDetailsQuerySchema,
  vendorMessageListQuerySchema,
  vendorMessageSearchQuerySchema,
  vendorMessageSendSchema,
} from '../../schemas/vendor/message';
import {
  listConversationsForUserInfo,
  searchConversationsForUserInfo,
} from '../../utils/chat/conversationQuery';
import { uploadChatImageFile } from '../../utils/chat/chatImageUpload';
import { getVendorMessageDetails } from '../../utils/chat/messageDetails';
import { vendorSendMessage } from '../../utils/chat/sendMessage';
import { getOrCreateVendorUserInfo, userInfoId } from '../../utils/chat/userInfo';
import { sendApiError, errorMessageFromUnknown } from '../../utils/apiErrorResponse';

const upload = multer({ storage: multer.memoryStorage() });

function requireVendorId(req: Request, res: Response): number | null {
  const vendorId = Number(req.user?.id);
  if (!vendorId) {
    res.status(401).json({ status: false, msg: 'Unauthorized' });
    return null;
  }
  return vendorId;
}

/**
 * @Description Vendor conversation inbox (PHP vendor/message/list)
 * @Route GET /api/vendor/message/list
 */
export const listConversations = async (req: Request, res: Response): Promise<any> => {
  const vendorId = requireVendorId(req, res);
  if (vendorId == null) return;

  const { error, value } = vendorMessageListQuerySchema.validate(req.query, {
    stripUnknown: true,
  });
  if (error) {
    return sendApiError(res, 403, error.message);
  }

  const sender = await getOrCreateVendorUserInfo(vendorId);
  const data = await listConversationsForUserInfo(userInfoId(sender), {
    ownerRole: 'vendor',
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
 * @Route GET /api/vendor/message/search-list
 */
export const searchConversations = async (req: Request, res: Response): Promise<any> => {
  const vendorId = requireVendorId(req, res);
  if (vendorId == null) return;

  const { error, value } = vendorMessageSearchQuerySchema.validate(req.query, {
    stripUnknown: true,
  });
  if (error) {
    return sendApiError(res, 403, error.message);
  }

  const sender = await getOrCreateVendorUserInfo(vendorId);
  const data = await searchConversationsForUserInfo(userInfoId(sender), value.name, {
    ownerRole: 'vendor',
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
 * @Route GET /api/vendor/message/details
 */
export const messageDetails = async (req: Request, res: Response): Promise<any> => {
  const vendorId = requireVendorId(req, res);
  if (vendorId == null) return;

  const { error, value } = vendorMessageDetailsQuerySchema.validate(req.query, {
    stripUnknown: true,
  });
  if (error) {
    return sendApiError(res, 403, error.message);
  }

  const sender = await getOrCreateVendorUserInfo(vendorId);
  const result = await getVendorMessageDetails({
    vendorUserInfoId: userInfoId(sender),
    vendorId,
    conversationId: value.conversation_id,
    customerUserId: value.user_id,
    deliveryManId: value.delivery_man_id,
    adminId: value.admin_id,
    limit: value.limit,
    page: value.offset,
  });

  if ('forbidden' in result && result.forbidden) {
    return sendApiError(res, 403, 'You cannot view this conversation');
  }

  return res.status(200).json(result);
};

/**
 * @Route POST /api/vendor/message/send
 */
export const sendMessage = async (req: Request, res: Response): Promise<any> => {
  const vendorId = requireVendorId(req, res);
  if (vendorId == null) return;

  const { error, value } = vendorMessageSendSchema.validate(req.body, { stripUnknown: true });
  if (error) {
    return sendApiError(res, 403, error.message);
  }

  const sender = await getOrCreateVendorUserInfo(vendorId);

  try {
    const data = await vendorSendMessage({
      vendorId,
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
    const raw = errorMessageFromUnknown(e, 'send_failed');
    const msg = raw.replace(/_/g, ' ');
    const status = raw === 'forbidden' || raw === 'conversation_not_found' ? 403 : 400;
    return sendApiError(res, status, msg);
  }
};

export const chatImageMiddleware = upload.single('image');

/**
 * @Route POST /api/vendor/message/chat-image
 */
export const chatImage = async (req: Request, res: Response): Promise<any> => {
  if (requireVendorId(req, res) == null) return;

  if (!req.file) {
    return sendApiError(res, 403, 'image is required');
  }
  if (req.file.size > 2 * 1024 * 1024) {
    return sendApiError(res, 403, 'Max file size is 2mb');
  }

  try {
    const result = await uploadChatImageFile(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname
    );
    return res.status(200).json(result);
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e, 'Upload failed'));
  }
};
