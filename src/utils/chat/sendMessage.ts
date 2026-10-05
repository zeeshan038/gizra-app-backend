import {
  countActiveOrdersForCustomerConversation,
  countActiveOrdersForDeliveryManConversation,
  countActiveOrdersForVendorConversation,
} from './conversationQuery';
import { participantSendMessage } from './participantSend';

export type CustomerSendMessageInput = {
  customerUserId: number;
  senderUserInfoId: number;
  conversationId?: number;
  receiverType?: string;
  receiverEntityId?: number;
  message?: string | null;
  fileJson?: string | null;
  limit: number;
  page: number;
};

export async function customerSendMessage(input: CustomerSendMessageInput) {
  return participantSendMessage({
    ownerRole: 'customer',
    senderUserInfoId: input.senderUserInfoId,
    conversationId: input.conversationId,
    receiverType: input.receiverType,
    receiverEntityId: input.receiverEntityId,
    message: input.message,
    fileJson: input.fileJson,
    limit: input.limit,
    page: input.page,
    countActiveOrders: (conv, sender, receiver) =>
      countActiveOrdersForCustomerConversation(
        input.customerUserId,
        conv,
        sender,
        receiver
      ),
  });
}

export async function vendorSendMessage(input: {
  vendorId: number;
  senderUserInfoId: number;
  conversationId?: number;
  receiverType?: string;
  receiverEntityId?: number;
  message?: string | null;
  fileJson?: string | null;
  limit: number;
  page: number;
}) {
  return participantSendMessage({
    ownerRole: 'vendor',
    senderUserInfoId: input.senderUserInfoId,
    conversationId: input.conversationId,
    receiverType: input.receiverType,
    receiverEntityId: input.receiverEntityId,
    message: input.message,
    fileJson: input.fileJson,
    limit: input.limit,
    page: input.page,
    countActiveOrders: (conv, sender, receiver) =>
      countActiveOrdersForVendorConversation(input.vendorId, conv, sender, receiver),
  });
}

export async function deliveryManSendMessage(input: {
  deliveryManId: number;
  senderUserInfoId: number;
  conversationId?: number;
  receiverType?: string;
  receiverEntityId?: number;
  message?: string | null;
  fileJson?: string | null;
  limit: number;
  page: number;
}) {
  return participantSendMessage({
    ownerRole: 'delivery_man',
    senderUserInfoId: input.senderUserInfoId,
    conversationId: input.conversationId,
    receiverType: input.receiverType,
    receiverEntityId: input.receiverEntityId,
    message: input.message,
    fileJson: input.fileJson,
    limit: input.limit,
    page: input.page,
    countActiveOrders: (conv, sender, receiver) =>
      countActiveOrdersForDeliveryManConversation(
        input.deliveryManId,
        conv,
        sender,
        receiver
      ),
  });
}
