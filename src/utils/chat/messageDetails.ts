import {
  countActiveOrdersForCustomerConversation,
  countActiveOrdersForDeliveryManConversation,
  countActiveOrdersForVendorConversation,
} from './conversationQuery';
import { getParticipantMessageDetails } from './participantDetails';

export async function getCustomerMessageDetails(params: {
  customerUserInfoId: number;
  customerUserId: number;
  conversationId?: number;
  vendorId?: number;
  deliveryManId?: number;
  adminId?: number;
  limit: number;
  page: number;
}) {
  return getParticipantMessageDetails({
    viewerUserInfoId: params.customerUserInfoId,
    conversationId: params.conversationId,
    adminId: params.adminId,
    vendorId: params.vendorId,
    deliveryManId: params.deliveryManId,
    limit: params.limit,
    page: params.page,
    countActiveOrders: (conv, sender, receiver) =>
      countActiveOrdersForCustomerConversation(
        params.customerUserId,
        conv,
        sender,
        receiver
      ),
  });
}

export async function getVendorMessageDetails(params: {
  vendorUserInfoId: number;
  vendorId: number;
  conversationId?: number;
  deliveryManId?: number;
  customerUserId?: number;
  adminId?: number;
  limit: number;
  page: number;
}) {
  return getParticipantMessageDetails({
    viewerUserInfoId: params.vendorUserInfoId,
    conversationId: params.conversationId,
    adminId: params.adminId,
    deliveryManId: params.deliveryManId,
    customerUserId: params.customerUserId,
    limit: params.limit,
    page: params.page,
    countActiveOrders: (conv, sender, receiver) =>
      countActiveOrdersForVendorConversation(params.vendorId, conv, sender, receiver),
  });
}

export async function getDeliveryManMessageDetails(params: {
  deliveryManUserInfoId: number;
  deliveryManId: number;
  conversationId?: number;
  vendorId?: number;
  customerUserId?: number;
  limit: number;
  page: number;
}) {
  return getParticipantMessageDetails({
    viewerUserInfoId: params.deliveryManUserInfoId,
    conversationId: params.conversationId,
    vendorId: params.vendorId,
    customerUserId: params.customerUserId,
    limit: params.limit,
    page: params.page,
    countActiveOrders: (conv, sender, receiver) =>
      countActiveOrdersForDeliveryManConversation(
        params.deliveryManId,
        conv,
        sender,
        receiver
      ),
  });
}
