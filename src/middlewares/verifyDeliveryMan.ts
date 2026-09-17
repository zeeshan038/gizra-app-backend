import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../config/database";

export const verifyDeliveryMan = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];

      const decoded: any = jwt.verify(
        token,
        process.env.JWT_SECRET || "your_jwt_secret_here"
      );

      const dmId = decoded.id || decoded._id;
      
      const dm = await prisma.delivery_men.findUnique({
        where: { id: BigInt(dmId as string) },
        select: {
          id: true,
          f_name: true,
          l_name: true,
          phone: true,
          email: true,
          image: true,
          status: true,
          auth_token: true
        },
      });

      if (!dm) {
        return res.status(401).json({
          status: false,
          msg: "Not authorized, delivery man not found"
        });
      }

      if (dm.auth_token !== token) {
        return res.status(401).json({
          status: false,
          msg: "Session expired. Logged in from another device."
        });
      }

      req.user = {
        ...dm,
        id: dm.id.toString(),
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
