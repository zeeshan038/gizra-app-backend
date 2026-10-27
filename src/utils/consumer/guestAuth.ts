import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_here';

/** Guest session JWT — use as Bearer on cart/order; not valid for profile/whoami. */
export function issueGuestJwt(guestId: bigint): string {
  return jwt.sign(
    {
      id: guestId.toString(),
      role: 'guest',
    },
    JWT_SECRET,
    { expiresIn: '365d' }
  );
}
