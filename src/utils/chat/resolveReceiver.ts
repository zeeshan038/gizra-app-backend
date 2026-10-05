import {
  getOrCreateCustomerUserInfo,
  getOrCreateDeliveryManUserInfo,
  getOrCreateVendorUserInfo,
  userInfoId,
} from './userInfo';

export async function resolveReceiverUserInfoId(
  receiverType: string,
  receiverEntityId?: number
): Promise<number> {
  if (receiverType === 'admin') return 0;

  if (receiverType === 'vendor') {
    if (receiverEntityId == null) throw new Error('receiver_id_required');
    return userInfoId(await getOrCreateVendorUserInfo(receiverEntityId));
  }
  if (receiverType === 'delivery_man') {
    if (receiverEntityId == null) throw new Error('receiver_id_required');
    return userInfoId(await getOrCreateDeliveryManUserInfo(receiverEntityId));
  }
  if (receiverType === 'customer') {
    if (receiverEntityId == null) throw new Error('receiver_id_required');
    return userInfoId(await getOrCreateCustomerUserInfo(receiverEntityId));
  }

  throw new Error('invalid_receiver_type');
}
