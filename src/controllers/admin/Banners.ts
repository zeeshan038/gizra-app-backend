import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * @Description Create a new banner/slider
 * @Route POST api/admin/banners
 * @Access Admin
 */
export const createBanner = async (req: Request, res: Response): Promise<any> => {
    try {
        const { title, type, image, data, zone_id } = req.body;

        if (!type || !data || zone_id === undefined) {
            return res.status(400).json({
                status: false,
                msg: "Type, data, and zone_id are required fields"
            });
        }

        const newBanner = await prisma.banners.create({
            data: {
                title,
                type,
                image,
                data,
                zone_id: Number(zone_id),
                status: true,
                created_at: new Date(),
                updated_at: new Date()
            }
        });

        return res.status(201).json({
            status: true,
            msg: "Banner created successfully",
            data: {
                ...newBanner,
                id: newBanner.id.toString(),
                zone_id: Number(newBanner.zone_id)
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
 * @Description Get all banners (Admin)
 * @Route GET api/admin/banners
 * @Access Admin
 */
export const getBanners = async (req: Request, res: Response): Promise<any> => {
    try {
        const banners = await prisma.banners.findMany({
            orderBy: { id: 'desc' }
        });

        const formattedBanners = banners.map(banner => ({
            ...banner,
            id: banner.id.toString(),
            zone_id: Number(banner.zone_id)
        }));

        return res.status(200).json({
            status: true,
            msg: "Banners fetched successfully",
            data: formattedBanners
        });
    } catch (error: any) {
        return res.status(500).json({
            status: false,
            msg: error.message
        });
    }
};
