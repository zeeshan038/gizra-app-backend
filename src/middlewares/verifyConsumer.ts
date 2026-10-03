import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../config/database";

declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

export const verifyConsumer = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  // Allow Guest users to bypass the JWT token requirement
  if (req.body?.is_guest === true || req.query?.is_guest === 'true' || req.body?.is_guest === 'true') {
      return next();
  }

  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      // Get token from header
      token = req.headers.authorization.split(" ")[1];

      // Verify token
      const decoded: any = jwt.verify(
        token,
        process.env.JWT_SECRET || "your_jwt_secret_here"
      );

      if (decoded.role === "guest") {
        const guestId = decoded.id || decoded._id;
        if (!guestId) {
          return res.status(401).json({
            status: false,
            msg: "Not authorized, invalid guest token",
          });
        }
        const guest = await prisma.guests.findUnique({
          where: { id: BigInt(guestId) },
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

      // Get user from the token
      const userId = decoded.id || decoded._id;
      
      const user = await prisma.users.findUnique({
        where: { id: Number(userId) },
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

      // In Gizra DB, `users` table doesn't have `currentToken` like `vendors` has `auth_token`.
      // We removed the session expiration check here, but it can be restored if the column is added.

      req.user = {
        ...user,
        // Convert BigInt to string to avoid JSON serialization issues later
        id: user.id.toString(),
      };
      
      return next();
    } catch (error) {
      console.error(error);
      return res.status(401).json({
        status: false,
        msg: "Not authorized, token failed"
      });
    }
  }

  if (!token) {
    return res.status(401).json({
      status: false,
      msg: "Not authorized, no token"
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
