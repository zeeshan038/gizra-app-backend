import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { createCategorySchema } from '../../../schemas/vendor/Catalog';

const prisma = new PrismaClient();

/**
 * @Description Create a new Menu Category
 * @Route POST /api/v1/vendor/catalog/category
 * @Access Private (Vendor)
 */
export const createCategory = async (req: Request, res: Response): Promise<any> => {
    const payload = req.body;
    const result = createCategorySchema.validate(payload);
    
    if (result.error) {
        return res.status(400).json({ 
            status: false, 
            msg: result.error.details.map((d: any) => d.message).join(',') 
        });
    }

    try {
        const category = await prisma.categories.create({
            data: {
                name: payload.name,
                image: payload.image || 'def.png',
                parent_id: payload.parent_id || 0,
                position: payload.parent_id ? 1 : 0,
                status: true,
                slug: payload.name.toLowerCase().replace(/[^a-zA-Z0-9]/g, '-')
            }
        });
        return res.status(201).json({ 
            status: true, 
            msg: 'Category created successfully', 
            data: { ...category, id: category.id.toString() } 
        });
    } catch (e: any) {
        return res.status(500).json({ status: false, msg: e.message });
    }
};

/**
 * @Description Get all Categories
 * @Route GET /api/v1/vendor/catalog/category
 * @Access Private (Vendor)
 */
export const getCategories = async (req: Request, res: Response): Promise<any> => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    try {
        const total = await prisma.categories.count({ where: { status: true } });

        const categories = await prisma.categories.findMany({
            where: { status: true },
            skip,
            take: limit,
            orderBy: { id: 'desc' }
        });
        
        return res.status(200).json({ 
            status: true, 
            data: categories,
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
