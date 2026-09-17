import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../config/database";

export const verifyAdmin = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
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

      const adminId = decoded.id || decoded._id;
      
      const admin = await prisma.admins.findUnique({
        where: { id: Number(adminId) },
        select: {
          id: true,
          f_name: true,
          l_name: true,
          phone: true,
          email: true,
          image: true,
          role_id: true,
          is_logged_in: true
        },
      });

      if (!admin) {
        return res.status(401).json({
          status: false,
          msg: "Not authorized, admin not found"
        });
      }

      req.user = {
        ...admin,
        id: admin.id.toString(),
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
