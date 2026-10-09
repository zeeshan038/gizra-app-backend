import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { dmUpdateProfileSchema } from '../../schemas/deliveryman/User';
import { normalizeStoredMedia } from '../../utils/mediaStorage';
import { formatDeliveryManPublic, requireDeliveryManId } from './User';

/**
 * @Description Get Delivery Man Profile
 * @Route GET /api/delivery-man/profile
 * @Access Private (Delivery Man)
 */
export const getProfile = async (req: Request, res: Response): Promise<any> => {
  const delivery_man_id = req.user?.id || req.query.dm_id;

  if (!delivery_man_id) {
    return res.status(400).json({ status: false, msg: 'Delivery man ID required' });
  }

  try {
    const dm = await prisma.delivery_men.findUnique({
      where: { id: BigInt(delivery_man_id as string) },
    });

    if (!dm) {
      return res.status(404).json({
        status: false,
        msg: 'Delivery man not found',
      });
    }

    return res.status(200).json({
      status: true,
      data: formatDeliveryManPublic(dm as unknown as Record<string, unknown>),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Request failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Description Update delivery man profile
 * @Route PUT /api/delivery-man/profile
 * @Route PUT /api/delivery-man/update-profile
 * @Access Private (Delivery Man)
 */
export const updateProfile = async (req: Request, res: Response): Promise<any> => {
  const dmId = requireDeliveryManId(req, res);
  if (dmId == null) return;

  const validated = dmUpdateProfileSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(', '),
    });
  }

  const body = validated.value as {
    f_name: string;
    l_name: string;
    email: string;
    password?: string | null;
    image?: string | null;
    vehicle_id?: number | null;
  };

  try {
    const dm = await prisma.delivery_men.findUnique({
      where: { id: BigInt(dmId) },
    });
    if (!dm) {
      return res.status(404).json({ status: false, msg: 'Delivery man not found' });
    }

    const emailNorm = body.email.trim().toLowerCase();
    const emailTaken = await prisma.delivery_men.findFirst({
      where: {
        email: { equals: emailNorm, mode: 'insensitive' },
        id: { not: BigInt(dmId) },
      },
      select: { id: true },
    });
    if (emailTaken) {
      return res.status(403).json({ status: false, msg: 'Email is already taken' });
    }

    const data: Record<string, unknown> = {
      f_name: body.f_name.trim(),
      l_name: body.l_name.trim(),
      email: emailNorm,
      updated_at: new Date(),
    };

    if (body.image !== undefined && body.image !== null && body.image !== '') {
      data.image = normalizeStoredMedia(body.image, dm.image ?? 'placeholder_profile.png', 100);
    }

    if (body.vehicle_id !== undefined) {
      data.vehicle_id =
        body.vehicle_id != null ? body.vehicle_id : null;
    }

    const password = body.password?.trim();
    if (password) {
      data.password = await bcrypt.hash(password, 10);
    }

    const updated = await prisma.delivery_men.update({
      where: { id: BigInt(dmId) },
      data: data as Parameters<typeof prisma.delivery_men.update>[0]['data'],
    });

    const userInfo = await prisma.user_infos.findFirst({
      where: { deliveryman_id: new Prisma.Decimal(String(dmId)) },
      select: { id: true },
    });
    if (userInfo) {
      await prisma.user_infos.update({
        where: { id: userInfo.id },
        data: {
          f_name: body.f_name.trim(),
          l_name: body.l_name.trim(),
          email: emailNorm,
          image: (data.image as string | undefined) ?? dm.image,
          updated_at: new Date(),
        },
      });
    }

    return res.status(200).json({
      status: true,
      msg: 'Profile updated successfully',
      message: 'successfully updated!',
      data: formatDeliveryManPublic(updated as unknown as Record<string, unknown>),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Request failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Description Toggle Active Status
 * @Route PUT /api/delivery-man/profile/status
 * @Access Private (Delivery Man)
 */
export const activeStatus = async (req: Request, res: Response): Promise<any> => {
  const delivery_man_id = req.user?.id || req.body.dm_id;

  if (!delivery_man_id) {
    return res.status(400).json({ status: false, msg: 'Delivery man ID required' });
  }

  try {
    const dm = await prisma.delivery_men.findUnique({
      where: { id: BigInt(delivery_man_id as string) },
    });

    if (!dm) {
      return res.status(404).json({ status: false, msg: 'Delivery man not found' });
    }

    const updatedDm = await prisma.delivery_men.update({
      where: { id: BigInt(delivery_man_id as string) },
      data: { active: !dm.active, updated_at: new Date() },
    });

    return res.status(200).json({
      status: true,
      msg: `Status changed to ${updatedDm.active ? 'active' : 'inactive'}`,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Request failed';
    return res.status(500).json({ status: false, msg });
  }
};
