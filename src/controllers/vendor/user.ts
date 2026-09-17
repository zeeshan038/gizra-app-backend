import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { genrateToken } from '../../utils/methods/methods';
import { vendorLoginSchema, vendorRegisterSchema } from '../../schemas/vendor/User';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_here';

/**
 * @Description Login Vendor
 * @Route POST api/vendor/login
 * @Access Public
 */
export const login = async (req: Request, res: Response): Promise<any> => {
    const payload = req.body;

       const result = vendorLoginSchema.validate(payload);
      if (result.error) {
          const errors = result.error.details.map((d: any) => d.message).join(",");
          return res.status(400).json({
              status: false,
              msg: errors
          });
      }
  try {

    const vendor = await prisma.vendors.findUnique({
      where: { email : payload.email},
    });

    if (!vendor) {
      return res.status(401).json({ status: false, msg: 'Credential do not match, please try again.' });
    }

    const isPasswordValid = await bcrypt.compare(payload.password, vendor?.password || '');
    
    if (!isPasswordValid) {
      return res.status(401).json({
        status: false,
        msg: 'Credential do not match, please try again.'
      });
    }

    const restaurants = await prisma.restaurants.findMany({
      where: { vendor_id: Number(vendor.id) },
    });
    
    const restaurant = restaurants[0];

    if (restaurant?.status === false && vendor.status === false) {
      return res.status(403).json({
        status: false,
        msg: 'Your registration is not approved yet. You can login once admin approved the request'
      });
    } else if (restaurant?.status === false && vendor.status === true) {
      return res.status(403).json({
        status: false,
        msg: 'Your account is suspended'
      });
    }

    const tokenData = await genrateToken(vendor, restaurant, JWT_SECRET);

    if (restaurant?.restaurant_model === 'none' || restaurant?.restaurant_model === 'unsubscribed') {
        return res.status(200).json({
            subscribed: {
                restaurant_id: Number(restaurant?.id),
                token: tokenData.token,
                package_id: restaurant?.package_id ? Number(restaurant.package_id) : null,
                zone_wise_topic: tokenData.zone_wise_topic,
                type: 'new_join'
            }
        });
    }

    return res.status(200).json({
      status: true,
      msg: 'Login success',
      data : {...tokenData}
    });

  } catch (error: any) {
    return res.status(500).json({
      status: false,
      msg: error.message
    });
  }
};

/**
 * @Description Register Vendor
 * @Route POST api/vendor/register
 * @Access Public
 */
export const register = async (req: Request, res: Response): Promise<any> => {
    const payload = req.body;

    const result = vendorRegisterSchema.validate(payload);
    if (result.error) {
        const errors = result.error.details.map((d: any) => d.message).join(",");
        return res.status(400).json({
            status: false,
            msg: errors
        });
    }

    try {
        // 1. Check if email or phone already exists
        const existingVendor = await prisma.vendors.findFirst({
            where: {
                OR: [
                    { email: payload.email },
                    { phone: payload.phone }
                ]
            }
        });

        if (existingVendor) {
            return res.status(400).json({
                status: false,
                msg: 'Email or phone already exists.'
            });
        }

        // 2. Hash password
        const hashedPassword = await bcrypt.hash(payload.password, 10);

        // 3. Create Vendor and Restaurant safely in a transaction
        await prisma.$transaction(async (prismaTx) => {
            const vendor = await prismaTx.vendors.create({
                data: {
                    f_name: payload.f_name,
                    l_name: payload.l_name,
                    email: payload.email,
                    phone: payload.phone,
                    password: hashedPassword,
                    status: false, // Pending admin approval
                    created_at: new Date(),
                    updated_at: new Date()
                }
            });

            await prismaTx.restaurants.create({
                data: {
                    name: payload.restaurant_name,
                    address: payload.restaurant_address,
                    phone: payload.phone,
                    email: payload.email,
                    latitude: payload.lat || "0",
                    longitude: payload.lng || "0",
                    vendor_id: Number(vendor.id),
                    zone_id: payload.zone_id,
                    tax: payload.tax || 0,
                    delivery_time: `${payload.minimum_delivery_time || '30'}-${payload.maximum_delivery_time || '45'}-${payload.delivery_time_type || 'min'}`,
                    status: false, // Pending admin approval
                    restaurant_model: 'none',
                    // Skipping image uploads for MVP, using placeholders
                    logo: 'default_logo.png',
                    cover_photo: 'default_cover.png',
                    created_at: new Date(),
                    updated_at: new Date()
                }
            });
        });

        return res.status(200).json({
            status: true,
            msg: 'Registration successful! Please wait for admin approval.'
        });

    } catch (error: any) {
        return res.status(500).json({
            status: false,
            msg: error.message
        });
    }
};
