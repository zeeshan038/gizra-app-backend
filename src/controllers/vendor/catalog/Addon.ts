import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import Joi from 'joi';

const prisma = new PrismaClient();

const createAddonSchema = Joi.object({
  name: Joi.string().required(),
  price: Joi.number().required().min(0),
  restaurant_id: Joi.number().required(),
  stock_type: Joi.string().valid('unlimited', 'limited').default('unlimited'),
  addon_stock: Joi.number().optional().default(0),
});

/**
 * @Description Create a new Add-on
 * @Route POST /api/vendor/catalog/addon
 * @Access Private (Vendor)
 */
export const createAddon = async (req: Request, res: Response): Promise<any> => {
    const payload = req.body;
    const result = createAddonSchema.validate(payload);
    
    if (result.error) {
        return res.status(400).json({ 
            status: false, 
            msg: result.error.details.map((d: any) => d.message).join(',') 
        });
    }

    try {
        const addon = await prisma.add_ons.create({
            data: {
                name: payload.name,
                price: payload.price,
                restaurant_id: payload.restaurant_id,
                stock_type: payload.stock_type,
                addon_stock: payload.stock_type === 'unlimited' ? 0 : payload.addon_stock,
                status: true
            }
        });

        return res.status(201).json({ 
            status: true, 
            msg: 'Add-on created successfully', 
            data: addon 
        });
    } catch (e: any) {
        return res.status(500).json({ status: false, msg: e.message });
    }
};

/**
 * @Description Get all Add-ons for a Restaurant
 * @Route GET /api/vendor/catalog/addon
 * @Access Private (Vendor)
 */
export const getAddons = async (req: Request, res: Response): Promise<any> => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    try {
        const { restaurant_id, search } = req.query;
        
        const whereClause: any = { status: true };
        
        if (restaurant_id) {
            whereClause.restaurant_id = Number(restaurant_id);
        }
        
        if (search) {
            whereClause.name = {
                contains: search as string,
                mode: 'insensitive'
            };
        }

        const total = await prisma.add_ons.count({ where: whereClause });

        const addons = await prisma.add_ons.findMany({
            where: whereClause,
            skip,
            take: limit,
            orderBy: { id: 'desc' }
        });

        return res.status(200).json({ 
            status: true, 
            data: addons,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (e: any) {
        return res.status(500).json({ status: false, msg: e.message });
    }
};
