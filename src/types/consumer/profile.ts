import { user_infos, users } from '@prisma/client';

export type ProfileUserRow = Pick<
  users,
  | 'id'
  | 'f_name'
  | 'l_name'
  | 'phone'
  | 'email'
  | 'image'
  | 'is_phone_verified'
  | 'is_email_verified'
  | 'ref_code'
  | 'zone_id'
  | 'wallet_balance'
  | 'loyalty_point'
  | 'interest'
  | 'cm_firebase_token'
  | 'current_language_key'
  | 'created_at'
  | 'order_count'
>;

export type ProfileUserInfoRow = Pick<
  user_infos,
  'id' | 'f_name' | 'l_name' | 'phone' | 'email' | 'image'
>;
