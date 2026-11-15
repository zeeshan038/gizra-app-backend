import { Request } from 'express';

export type CartSession = {
  user_id: number;
  is_guest: boolean;
};

type CartSessionError = { error: { status: number; msg: string } };

export function resolveCartSessionFromRequest(
  req: Request,
  payload?: { is_guest?: boolean; guest_id?: number | null }
): CartSession | CartSessionError {
  const isGuestSession = req.user?.isGuest === true;
  const is_guest = Boolean(payload?.is_guest) || isGuestSession || req.query.is_guest === 'true';

  if (is_guest) {
    const user_id = isGuestSession
      ? Number(req.user?.id)
      : payload?.guest_id != null
        ? Number(payload.guest_id)
        : req.query.guest_id
          ? Number(req.query.guest_id)
          : null;
    if (!user_id || !Number.isFinite(user_id)) {
      return { error: { status: 400, msg: 'guest_id is required for guest users' } };
    }
    return { user_id, is_guest: true };
  }

  const user_id = Number(req.user?.id);
  if (!user_id || !Number.isFinite(user_id)) {
    return { error: { status: 401, msg: 'Unauthorized' } };
  }
  return { user_id, is_guest: false };
}

export function cartRowOwnedBy(
  row: { user_id: unknown; is_guest: boolean | null },
  session: CartSession
): boolean {
  return Number(row.user_id) === session.user_id && Boolean(row.is_guest) === session.is_guest;
}