import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { createFoodSchema } from '../../../schemas/vendor/Catalog';

const prisma = new PrismaClient();

/**
 * @Description Create a new Food Item
 * @Route POST /api/v1/vendor/catalog/food
 * @Access Private (Vendor)
 */
export const createFood = async (req: Request, res: Response): Promise<any> => {
    const payload = req.body;
    const result = createFoodSchema.validate(payload);
    
    if (result.error) {
        return res.status(400).json({ 
            status: false, 
            msg: result.error.details.map((d: any) => d.message).join(',') 
        });
    }

    try {
        const food = await prisma.food.create({
            data: {
                name: payload.name,
                description: payload.description || '',
                image: payload.image || 'def.png',
                category_id: payload.category_id,
                price: payload.price,
                restaurant_id: payload.restaurant_id,
                variations: JSON.stringify(payload.variations),
                add_ons: JSON.stringify(payload.add_ons),
                status: true,
                veg: false
            }
        });
        
        return res.status(201).json({ 
            status: true, 
            msg: 'Food item created successfully', 
            data: { ...food, id: food.id.toString() } 
        });
    } catch (e: any) {
        return res.status(500).json({ status: false, msg: e.message });
    }
};

/**
 * @Description Get all Food Items for a Restaurant
 * @Route GET /api/v1/vendor/catalog/food
 * @Access Private (Vendor)
 */
export const getFoods = async (req: Request, res: Response): Promise<any> => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    try {
        const { restaurant_id, search } = req.query;
        
        const whereClause: any = {};
        
        if (restaurant_id) {
            whereClause.restaurant_id = Number(restaurant_id);
        }
        
        if (search) {
            whereClause.name = {
                contains: search as string,
                mode: 'insensitive'
            };
        }

        const total = await prisma.food.count({ where: whereClause });

        const foods = await prisma.food.findMany({
            where: whereClause,
            skip,
            take: limit,
            orderBy: { id: 'desc' }
        });

        return res.status(200).json({ 
            status: true, 
            data: foods,
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
