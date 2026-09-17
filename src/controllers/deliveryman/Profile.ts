import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * @Description Get Delivery Man Profile
 * @Route GET /api/delivery-man/profile
 * @Access Private (Delivery Man)
 */
export const getProfile = async (req: Request, res: Response): Promise<any> => {
    // Assuming auth middleware sets req.user with delivery_man details
    const delivery_man_id = (req as any).user?.id || req.query.dm_id;

    if (!delivery_man_id) {
        return res.status(400).json({ status: false, msg: 'Delivery man ID required' });
    }

    try {
        const dm = await prisma.delivery_men.findUnique({
            where: { id: BigInt(delivery_man_id as string) }
        });

        if (!dm) {
            return res.status(404).json({ status: false, msg: 'Delivery man not found' });
        }

        // Exclude password
        const { password, ...safeProfile } = dm as any;
        safeProfile.id = safeProfile.id.toString();

        return res.status(200).json({ status: true, data: safeProfile });
    } catch (e: any) {
        return res.status(500).json({ status: false, msg: e.message });
    }
};

/**
 * @Description Toggle Active Status
 * @Route PUT /api/delivery-man/status
 * @Access Private (Delivery Man)
 */
export const activeStatus = async (req: Request, res: Response): Promise<any> => {
    const delivery_man_id = (req as any).user?.id || req.body.dm_id;

    if (!delivery_man_id) {
        return res.status(400).json({ status: false, msg: 'Delivery man ID required' });
    }

    try {
        const dm = await prisma.delivery_men.findUnique({
            where: { id: BigInt(delivery_man_id as string) }
        });

        if (!dm) {
            return res.status(404).json({ status: false, msg: 'Delivery man not found' });
        }

        const updatedDm = await prisma.delivery_men.update({
            where: { id: BigInt(delivery_man_id as string) },
            data: { active: !dm.active }
        });

        return res.status(200).json({ 
            status: true, 
            msg: `Status changed to ${updatedDm.active ? 'active' : 'inactive'}` 
        });
    } catch (e: any) {
        return res.status(500).json({ status: false, msg: e.message });
    }
};
