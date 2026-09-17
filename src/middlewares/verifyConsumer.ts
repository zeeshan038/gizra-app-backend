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
