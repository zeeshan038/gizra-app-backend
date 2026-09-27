import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { dmLoginSchema, dmRegisterSchema } from '../../schemas/deliveryman/User';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_here';

function normalizeDriverRegisterBody(body: Record<string, unknown>) {
  const normalized = { ...body };
  if (normalized.fName != null && normalized.f_name == null) {
    normalized.f_name = normalized.fName;
  }
  if (normalized.lName != null && normalized.l_name == null) {
    normalized.l_name = normalized.lName;
  }
  return normalized;
}

/**
 * @Description Register Delivery Man (driver app — full form)
 * @Route POST /api/delivery-man/register
 * @Access Public
 */
export const register = async (req: Request, res: Response): Promise<any> => {
  const payload = normalizeDriverRegisterBody(req.body);

  const result = dmRegisterSchema.validate(payload, { stripUnknown: true });
  if (result.error) {
    const errors = result.error.details.map((d) => d.message).join(',');
    return res.status(400).json({
      status: false,
      msg: errors,
    });
  }

  const data = result.value as {
    f_name: string;
    l_name: string;
    email: string;
    phone: string;
    password: string;
    identity_image?: string | null;
    zone_id: number;
    identity_type?: string;
    identity_number?: string;
    earning?: boolean;
  };

  try {
    const existingDriver = await prisma.delivery_men.findFirst({
      where: {
        OR: [{ phone: data.phone }, { email: data.email }],
      },
    });

    if (existingDriver) {
      return res.status(400).json({
        status: false,
        msg: 'Phone or email already exists.',
      });
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    await prisma.delivery_men.create({
      data: {
        f_name: data.f_name,
        l_name: data.l_name,
        email: data.email,
        phone: data.phone,
        password: hashedPassword,
        identity_type: data.identity_type || 'nid',
        identity_number: data.identity_number || '',
        zone_id: data.zone_id,
        earning: data.earning ?? true,
        application_status: 'pending',
        status: false,
        active: false,
        type: 'zone_wise',
        identity_image: data.identity_image?.trim() || 'placeholder_id.png',
        image: 'placeholder_profile.png',
        created_at: new Date(),
        updated_at: new Date(),
      },
    });

    return res.status(200).json({
      status: true,
      msg: 'Registration successful! Please wait for admin approval.',
      data: { application_status: 'pending' },
    });
  } catch (error: any) {
    return res.status(500).json({
      status: false,
      msg: error.message,
    });
  }
};

/**
 * @Description Login Delivery Man
 * @Route POST /api/delivery-man/login
 * @Access Public
 */
export const login = async (req: Request, res: Response): Promise<any> => {
  const payload = req.body;

  const result = dmLoginSchema.validate(payload);
  if (result.error) {
    const errors = result.error.details.map((d: any) => d.message).join(',');
    return res.status(400).json({
      status: false,
      msg: errors,
    });
  }

  try {
    const driver = await prisma.delivery_men.findUnique({
      where: { phone: payload.phone },
      include: {
        zones: true,
      },
    } as any) as any;

    if (!driver) {
      return res.status(401).json({
        status: false,
        msg: 'Credential do not match, please try again.',
      });
    }

    const isPasswordValid = await bcrypt.compare(payload.password, driver.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        status: false,
        msg: 'Credential do not match, please try again.',
      });
    }

    if (driver.application_status !== 'approved') {
      return res.status(401).json({
        status: false,
        msg: 'Your application is not approved yet',
      });
    }

    if (!driver.status) {
      return res.status(401).json({
        status: false,
        msg: 'Your account has been suspended',
      });
    }

    const token = jwt.sign(
      { id: driver.id.toString(), phone: driver.phone, role: 'delivery_man' },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    await prisma.delivery_men.update({
      where: { id: driver.id },
      data: { auth_token: token } as any,
    });

    let topic = 'No_topic_found';
    if (driver.zone_id) {
      if (driver.vehicle_id) {
        topic = `delivery_man_${driver.zone_id}_${driver.vehicle_id}`;
      } else {
        topic =
          driver.type === 'zone_wise'
            ? driver.zones?.deliveryman_wise_topic || 'No_topic_found'
            : `restaurant_dm_${driver.restaurant_id}`;
      }
    } else {
      topic =
        driver.type === 'restaurant_wise'
          ? `restaurant_dm_${driver.restaurant_id}`
          : 'No_topic_found';
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
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      status: false,
      msg: error.message,
    });
  }
};
