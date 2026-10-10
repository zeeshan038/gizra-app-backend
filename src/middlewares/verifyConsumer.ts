import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../config/database";
import { isTransientDbError, safeApiErrorMessage } from "../utils/safeApiError";

declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

function toBigIntId(value: unknown): bigint | null {
  if (value == null || value === "") return null;
  try {
    const id = BigInt(String(value));
    return id > 0n ? id : null;
  } catch {
    return null;
  }
}

/** Accept `Bearer <jwt>`, `bearer <jwt>`, or a raw JWT in Authorization. */
function extractConsumerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (typeof header !== "string" || !header.trim()) return undefined;

  const trimmed = header.trim();
  const bearer = trimmed.match(/^bearer\s+(\S+)/i);
  if (bearer?.[1]) return bearer[1];

  if (trimmed.split(".").length === 3) return trimmed;
  return undefined;
}

export const verifyConsumer = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  // Allow Guest users to bypass the JWT token requirement
  if (req.body?.is_guest === true || req.query?.is_guest === 'true' || req.body?.is_guest === 'true') {
      return next();
  }

  const token = extractConsumerToken(req);
  if (!token) {
    return res.status(401).json({
      status: false,
      msg: "Not authorized, no token"
    });
  }

  try {
    const decoded: any = jwt.verify(
      token,
      process.env.JWT_SECRET || "your_jwt_secret_here"
    );

    if (decoded.role === "guest") {
      const guestId = toBigIntId(decoded.id ?? decoded._id);
      if (!guestId) {
        return res.status(401).json({
          status: false,
          msg: "Not authorized, invalid guest token",
        });
      }
      const guest = await prisma.guests.findUnique({
        where: { id: guestId },
      });
      if (!guest) {
        return res.status(401).json({
          status: false,
          msg: "Not authorized, guest session not found",
        });
      }
      req.user = {
        id: guest.id.toString(),
        isGuest: true,
        role: "guest",
      };
      return next();
    }

    const userId = toBigIntId(decoded.id ?? decoded._id);
    if (!userId) {
      return res.status(401).json({
        status: false,
        msg: "Not authorized, token failed"
      });
    }

    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: {
        id: true,
        f_name: true,
        l_name: true,
        phone: true,
        email: true,
        image: true,
        status: true
      },
    });

    if (!user) {
      return res.status(401).json({
        status: false,
        msg: "Not authorized, user not found"
      });
    }

    req.user = {
      ...user,
      id: user.id.toString(),
      isGuest: false,
      role: decoded.role || "customer",
    };

    return next();
  } catch (error) {
    if (isTransientDbError(error)) {
      console.error("[verifyConsumer] database unavailable", error);
      return res.status(503).json({
        status: false,
        msg: safeApiErrorMessage(error),
      });
    }
    console.error(error);
    return res.status(401).json({
      status: false,
      msg: "Not authorized, token failed"
    });
  }
};

/** Blocks guest-session JWT from profile, favourites, etc. */
export function requireRegisteredConsumer(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (req.user?.isGuest) {
    res.status(401).json({
      status: false,
      msg: "Login required — guest sessions cannot access this resource.",
    });
    return;
  }
  next();
}
