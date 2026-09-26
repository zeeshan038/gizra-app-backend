import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireZoneIds } from '../../utils/consumer/zoneHeaders';

const prisma = new PrismaClient();

/**
 * @Description Home Slider (banners in customer zone(s); header zoneId required)
 * @Route GET api/consumer/home-slider
 * @Access Public
 */ 
export const getHomeSlider = async (req: Request, res: Response): Promise<any> => {
    const zoneIds = requireZoneIds(req, res);
    if (!zoneIds) return;

    try {
        const banners = await prisma.banners.findMany({
            where: {
                status: true,
                zone_id: { in: zoneIds },
            },
            select: {
                id: true,
                title: true,
                type: true,
                image: true,
                data: true,
                zone_id: true
            },
            orderBy: { id: 'desc' }
        });

        // Format BigInt and Decimal fields for JSON
        const formattedBanners = banners.map(banner => ({
            ...banner,
            id: banner.id.toString(),
            zone_id: banner.zone_id ? Number(banner.zone_id) : 0
        }));

        return res.status(200).json({
            status: true,
            msg: "Home sliders fetched successfully",
            data: formattedBanners
        });
    } catch (error: any) {
        return res.status(500).json({
            status: false,
            msg: error.message
        });
    }
};