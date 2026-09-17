import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../../config/database';
import { adminLoginSchema } from '../../schemas/admin/User';

/**
 * @Description Admin Login
 * @Route POST /api/v1/admin/auth/login
 * @Access Public
 */
export const login = async (req: Request, res: Response): Promise<any> => {
    const payload = req.body;

    // 1. Validate request payload
    const result = adminLoginSchema.validate(payload);
    if (result.error) {
        const errors = result.error.details.map((d: any) => d.message).join(",");
        return res.status(400).json({
            status: false,
            msg: errors
        });
    }

    try {
        // 2. Find admin by email
        const admin = await prisma.admins.findUnique({
            where: { email: payload.email }
        });

        if (!admin) {
            return res.status(401).json({
                status: false,
                msg: 'Credentials do not match, please try again.'
            });
        }

        // 3. Verify password
        const isPasswordValid = await bcrypt.compare(payload.password, admin.password);
        
        if (!isPasswordValid) {
            return res.status(401).json({
                status: false,
                msg: 'Credentials do not match, please try again.'
            });
        }

        // 4. Generate JWT
        const token = jwt.sign(
            { id: admin.id.toString(), email: admin.email, role_id: admin.role_id?.toString() },
            process.env.JWT_SECRET || 'your_jwt_secret_here',
            { expiresIn: '30d' }
        );

        // 5. Update is_logged_in status
        await prisma.admins.update({
            where: { id: admin.id },
            data: { is_logged_in: true }
        });

        // 6. Return response
        const { password, remember_token, ...adminData } = admin;
        return res.status(200).json({
            status: true,
            msg: 'Login successful',
            data: {
                token,
                user: {
                    ...adminData,
                    id: admin.id.toString(),
                    role_id: admin.role_id?.toString(),
                    zone_id: admin.zone_id?.toString()
                }
            }
        });

    } catch (error: any) {
        return res.status(500).json({
            status: false,
            msg: error.message
        });
    }
};
