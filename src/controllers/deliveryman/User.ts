import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { dmLoginSchema, dmRegisterSchema } from '../../schemas/deliveryman/User';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_here';

/**
 * @Description Register Delivery Man
 * @Route POST /api/v1/auth/delivery-man/register
 * @Access Public
 */
export const register = async (req: Request, res: Response): Promise<any> => {
    const payload = req.body;

    const result = dmRegisterSchema.validate(payload);
    if (result.error) {
        const errors = result.error.details.map((d: any) => d.message).join(",");
        return res.status(400).json({
            status: false,
            msg: errors
        });
    }

    try {
        const existingDriver = await prisma.delivery_men.findFirst({
            where: { phone: payload.phone }
        });

        if (existingDriver) {
            return res.status(400).json({
                status: false,
                msg: 'Phone number already exists.'
            });
        }

        const hashedPassword = await bcrypt.hash(payload.password, 10);

        const newDriver = await prisma.delivery_men.create({
            data: {
                f_name: payload.fName,
                l_name: payload.lName,
                email: payload.email || null,
                phone: payload.phone,
                password: hashedPassword,
                identity_type: payload.identity_type,
                identity_number: payload.identity_number,
                zone_id: payload.zone_id,
                earning: payload.earning,
                application_status: 'pending', // Waiting for admin approval
                status: false,
                active: false,
                type: 'zone_wise',
                identity_image: 'placeholder_id.png', // MVP placeholder
                image: 'placeholder_profile.png' // MVP placeholder
            }
        });

        return res.status(200).json({
            status: true,
            msg: 'Registration successful! Please wait for admin approval.',
        });
    } catch (error: any) {
        return res.status(500).json({
            status: false,
            msg: error.message
        });
    }
};

/**
 * @Description Login Delivery Man
 * @Route POST /api/v1/auth/delivery-man/login
 * @Access Public
 */
export const login = async (req: Request, res: Response): Promise<any> => {
    const payload = req.body;

    const result = dmLoginSchema.validate(payload);
    if (result.error) {
        const errors = result.error.details.map((d: any) => d.message).join(",");
        return res.status(400).json({
            status: false,
            msg: errors
        });
    }

    try {
        const driver = await prisma.delivery_men.findUnique({
            where: { phone: payload.phone },
            include: {
                zones: true // Ensure relation is included for topic generation
            }
        } as any) as any;

        if (!driver) {
            return res.status(401).json({
                status: false,
                msg: 'Credential do not match, please try again.'
            });
        }

        const isPasswordValid = await bcrypt.compare(payload.password, driver.password);
        if (!isPasswordValid) {
            return res.status(401).json({
                status: false,
                msg: 'Credential do not match, please try again.'
            });
        }

        if (driver.application_status !== 'approved') {
            return res.status(401).json({
                status: false,
                msg: 'Your application is not approved yet'
            });
        }

        if (!driver.status) {
            return res.status(401).json({
                status: false,
                msg: 'Your account has been suspended'
            });
        }

        const token = jwt.sign(
            { id: driver.id.toString(), phone: driver.phone, role: 'delivery_man' },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        await prisma.delivery_men.update({
            where: { id: driver.id },
            data: { auth_token: token } as any
        });

        let topic = 'No_topic_found';
        if (driver.zone_id) {
            if (driver.vehicle_id) {
                topic = `delivery_man_${driver.zone_id}_${driver.vehicle_id}`;
            } else {
                topic = driver.type === 'zone_wise' 
                    ? (driver.zones?.deliveryman_wise_topic || 'No_topic_found') 
                    : `restaurant_dm_${driver.restaurant_id}`;
            }
        } else {
            topic = driver.type === 'restaurant_wise' ? `restaurant_dm_${driver.restaurant_id}` : 'No_topic_found';
        }

        return res.status(200).json({
            status: true,
            msg: 'Login success',
            data: {
                token,
                topic,
                id: driver.id.toString(),
                f_name: driver.f_name,
                l_name: driver.l_name,
                phone: driver.phone,
            }
        });

    } catch (error: any) {
        return res.status(500).json({
            status: false,
            msg: error.message
        });
    }
};
