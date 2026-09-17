import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../config/database";

export const verifyVendor = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
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

      const vendorId = decoded.id || decoded._id;
      
      const vendor = await prisma.vendors.findUnique({
        where: { id: Number(vendorId) },
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

      if (!vendor) {
        return res.status(401).json({
          status: false,
          msg: "Not authorized, vendor not found"
        });
      }

      if (vendor.auth_token !== token) {
        return res.status(401).json({
          status: false,
          msg: "Session expired. Logged in from another device."
        });
      }

      req.user = {
        ...vendor,
        id: vendor.id.toString(),
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
