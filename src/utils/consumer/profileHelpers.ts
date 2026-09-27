import prisma from '../../config/database';
import { ProfileUserInfoRow, ProfileUserRow } from '../../types/consumer/profile';

export const ONGOING_ORDER_STATUSES = [
  'pending',
  'accepted',
  'confirmed',
  'processing',
  'handover',
  'picked_up',
] as const;

export function formatProfileUser(user: ProfileUserRow) {
  return {
    id: user.id.toString(),
    f_name: user.f_name,
    l_name: user.l_name,
    phone: user.phone,
    email: user.email,
    image: user.image,
    is_phone_verified: user.is_phone_verified ? 1 : 0,
    is_email_verified: user.is_email_verified ? 1 : 0,
    ref_code: user.ref_code,
    zone_id: user.zone_id != null ? Number(user.zone_id) : null,
    wallet_balance: Number(user.wallet_balance),
    loyalty_point: Number(user.loyalty_point),
    interest: user.interest,
    cm_firebase_token: user.cm_firebase_token,
    current_language_key: user.current_language_key ?? 'en',
    created_at: user.created_at,
    order_count: Number(user.order_count),
  };
}

export function formatUserinfo(row: ProfileUserInfoRow | null) {
  if (!row) return null;
  return {
    id: row.id.toString(),
    f_name: row.f_name,
    l_name: row.l_name,
    phone: row.phone,
    email: row.email,
    image: row.image,
  };
}

export function loadUserInfo(userId: number) {
  return prisma.user_infos.findFirst({
    where: { user_id: userId },
  });
}

export async function persistUserZoneId(userId: number, zoneId: number) {
  await prisma.users.update({
    where: { id: BigInt(userId) },
    data: { zone_id: zoneId, updated_at: new Date() },
  });
}

export function parseInterestCategoryIds(interest: string | null | undefined): number[] | null {
  if (!interest) return null;
  try {
    const parsed = JSON.parse(interest);
    if (!Array.isArray(parsed)) return null;
    const ids = parsed.map((c) => Number(c)).filter((n) => Number.isFinite(n));
    return ids.length ? ids : null;
  } catch {
    return null;
  }
}
