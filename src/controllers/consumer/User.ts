//NPM Packages
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const prisma = new PrismaClient();

//Schema
import { consumerLoginSchema, consumerRegisterSchema } from '../../schemas/consumer/User';

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_here';

// Helper to generate unique referral code
const generateReferralCode = async (f_name: string, id: number): Promise<string> => {
    let code = `${f_name.substring(0, 3).toUpperCase()}${crypto.randomBytes(2).toString('hex').toUpperCase()}${id}`;
    let exists = await prisma.users.findFirst({ where: { ref_code: code } });
    while (exists) {
        code = `${f_name.substring(0, 3).toUpperCase()}${crypto.randomBytes(2).toString('hex').toUpperCase()}${id}`;
        exists = await prisma.users.findFirst({ where: { ref_code: code } });
    }
    return code;
};

/**
 * @Description Register Consumer
 * @Route POST api/consumer/register
 * @Access Public
 */
export const register = async (req: Request, res: Response): Promise<any> => {
    const payload = req.body;

    const result = consumerRegisterSchema.validate(payload);
    if (result.error) {
        const errors = result.error.details.map((d: any) => d.message).join(",");
        return res.status(403).json({
            status: false,
            msg: errors
        });
    }

    try {
        // Check if phone or email already exists
        const existingUser = await prisma.users.findFirst({
            where: {
                OR: [
                    { phone: payload.phone },
                    ...(payload.email ? [{ email: payload.email }] : [])
                ]
            }
        });

        if (existingUser) {
            return res.status(403).json({
                status: false,
                msg: 'Phone or email is already registered.'
            });
        }

        // Handle referral code
        if (payload.ref_code) {
            const refStatus = await prisma.business_settings.findFirst({ where: { key: 'ref_earning_status' } });
            if (!refStatus || refStatus.value !== '1') {
                return res.status(403).json({ status: false, msg: 'Referral code is currently disabled.' });
            }
            // Add business logic to reward referee here if needed
        }

        const hashedPassword = await bcrypt.hash(payload.password, 10);

        let newUser = await prisma.users.create({
            data: {
                f_name: payload.f_name,
                l_name: payload.l_name || '',
                phone: payload.phone,
                email: payload.email || null,
                password: hashedPassword,
                status: true // consumers are typically active upon registration
            }
        });

        // Generate and update ref_code
        const refCode = await generateReferralCode(newUser.f_name || 'USR', Number(newUser.id));
        newUser = await prisma.users.update({
            where: { id: newUser.id },
            data: { ref_code: refCode }
        });

        return res.status(200).json({
            status: true,
            msg: 'Registration successful!',
            data: {
                id: newUser.id.toString(),
                f_name: newUser.f_name,
                l_name: newUser.l_name,
                phone: newUser.phone,
                email: newUser.email,
                ref_code: newUser.ref_code
            }
        });
    } catch (error: any) {
        return res.status(500).json({
            status: false,
            msg: error.message
        });
    }
};

/**
 * Helper to check and merge guest cart to user cart
 */
const checkGuestCart = async (userId: number, guestId: number) => {
    if (!guestId || !userId) return;

    // Get all guest cart items
    const guestCartItems = await prisma.carts.findMany({
        where: { user_id: guestId }
    });

    if (guestCartItems.length === 0) return;

    const itemIds = guestCartItems.map(c => Number(c.item_id));

    // Get the corresponding food items to find the restaurant_ids
    const foodItems = await prisma.food.findMany({
        where: { id: { in: itemIds.map(id => BigInt(id)) } },
        select: { id: true, restaurant_id: true }
    });

    const guestStoreIds = foodItems.map(f => Number(f.restaurant_id)).filter(id => !isNaN(id));

    if (guestStoreIds.length > 0) {
        // Delete user's existing cart items from these restaurants to avoid collision
        // We have to find carts matching the user and those store IDs
        // Since carts don't have a direct relation in Prisma, we do it in two steps:
        const userCarts = await prisma.carts.findMany({
            where: { user_id: userId }
        });
        
        const userCartItemIds = userCarts.map(c => Number(c.item_id));
        
        const userFoods = await prisma.food.findMany({
            where: {
                id: { in: userCartItemIds.map(id => BigInt(id)) },
                restaurant_id: { in: guestStoreIds }
            },
            select: { id: true }
        });

        const foodIdsToDelete = userFoods.map(f => Number(f.id));

        if (foodIdsToDelete.length > 0) {
            await prisma.carts.deleteMany({
                where: {
                    user_id: userId,
                    item_id: { in: foodIdsToDelete }
                }
            });
        }

        // Update guest cart to belong to the logged-in user
        await prisma.carts.updateMany({
            where: { user_id: guestId },
            data: { user_id: userId, is_guest: false }
        });
    }
};

/**
 * @Description Login Consumer
 * @Route POST api/consumer/login
 * @Access Public
 */
export const login = async (req: Request, res: Response): Promise<any> => {
    const payload = req.body;

    const result = consumerLoginSchema.validate(payload);
    if (result.error) {
        const errors = result.error.details.map((d: any) => d.message).join(",");
        return res.status(403).json({
            status: false,
            msg: errors
        });
    }

    try {
        if (payload.login_type === 'manual') {
            const user = await prisma.users.findFirst({
                where: payload.field_type === 'email' 
                    ? { email: payload.email_or_phone } 
                    : { phone: payload.email_or_phone }
            });

            if (!user) {
                return res.status(401).json({
                    status: false,
                    msg: 'Credential do not match, please try again.'
                });
            }

            // Verify password
            const isPasswordValid = await bcrypt.compare(payload.password, user.password || '');
            if (!isPasswordValid) {
                return res.status(401).json({
                    status: false,
                    msg: 'Credential do not match, please try again.'
                });
            }

            // Check status
            if (!user.status) {
                return res.status(403).json({
                    status: false,
                    msg: 'Your account is blocked'
                });
            }

            // Ensure ref code exists (PHP refer_code_check)
            if (!user.ref_code) {
                const refCode = await generateReferralCode(user.f_name || 'USR', Number(user.id));
                await prisma.users.update({
                    where: { id: user.id },
                    data: { ref_code: refCode }
                });
            }

            // Merge guest cart if guest_id is provided
            if (payload.guest_id) {
                await checkGuestCart(Number(user.id), payload.guest_id);
            }

            // Generate Token
            const token = jwt.sign(
                { 
                    id: user.id.toString(), 
                    email: user.email, 
                    phone: user.phone,
                    role: 'customer'
                },
                JWT_SECRET,
                { expiresIn: '30d' }
            );

            return res.status(200).json({
                status: true,
                msg: 'Login success',
                data: {
                    token,
                    is_phone_verified: user.is_phone_verified ? 1 : 0,
                    is_email_verified: 1, // default based on PHP
                    login_type: 'manual'
                }
            });

        } else if (payload.login_type === 'otp') {
            // OTP login implementation stub
            return res.status(501).json({ status: false, msg: 'OTP Login not yet fully migrated.' });
        } else if (payload.login_type === 'social') {
            // Social login implementation stub
            return res.status(501).json({ status: false, msg: 'Social Login not yet fully migrated.' });
        }

    } catch (error: any) {
        return res.status(500).json({
            status: false,
            msg: error.message
        });
    }
};

/**
 * @Description Guest User Registration
 * @Route POST api/consumer/guest/request
 * @Access Public
 */
export const guestRequest = async (req: Request, res: Response): Promise<any> => {
    try {
        const payload = req.body;
        // Grab IP Address from request
        const ipAddress = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString();

        const guest = await prisma.guests.create({
            data: {
                ip_address: ipAddress,
                fcm_token: payload.fcm_token || null
            }
        });

        if (guest) {
            return res.status(200).json({
                message: 'Guest verified successfully',
                guest_id: guest.id.toString(),
            });
        }

        return res.status(404).json({
            message: 'Failed to create guest'
        });
    } catch (error: any) {
        return res.status(500).json({
            message: error.message
        });
    }
};
