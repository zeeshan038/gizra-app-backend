import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { placeOrderSchema } from '../../schemas/consumer/Order';

const prisma = new PrismaClient();

/**
 * @Description Place an order from the user's cart
 * @Route POST /api/consumer/order/place
 * @Access Public
 */
export const placeOrder = async (req: Request, res: Response): Promise<any> => {
    const payload = req.body;
    const result = placeOrderSchema.validate(payload);
    
    if (result.error) {
        return res.status(400).json({ status: false, msg: result.error.details.map((d: any) => d.message).join(',') });
    }

    try {
        // 1. Fetch Cart Items
        const cartItems = await prisma.carts.findMany({
            where: { user_id: payload.user_id, is_guest: false }
        });

        if (cartItems.length === 0) {
            return res.status(400).json({ status: false, msg: 'Cart is empty' });
        }

        // 2. Create Order in Transaction
        const orderResult = await prisma.$transaction(async (tx) => {
            
            // Create Order
            const order = await tx.orders.create({
                data: {
                    user_id: payload.user_id,
                    restaurant_id: payload.restaurant_id,
                    order_amount: payload.order_amount,
                    payment_method: payload.payment_method,
                    order_status: 'pending',
                    payment_status: 'unpaid',
                    order_type: payload.order_type,
                    delivery_charge: payload.delivery_charge,
                    total_tax_amount: payload.total_tax_amount,
                    order_note: payload.order_note || null,
                    delivery_address_id: payload.delivery_address_id || null,
                    original_delivery_charge: payload.delivery_charge,
                    restaurant_discount_amount: 0,
                    coupon_discount_amount: 0
                }
            });

            // Create Order Details
            const orderDetailsData = cartItems.map(cart => ({
                order_id: Number(order.id),
                food_id: cart.item_id,
                price: cart.price,
                quantity: cart.quantity,
                variation: cart.variations,
                add_ons: cart.add_on_ids,
                tax_amount: 0, 
                total_add_on_price: 0
            }));

            await tx.order_details.createMany({
                data: orderDetailsData
            });

            // Delete Cart
            await tx.carts.deleteMany({
                where: { user_id: payload.user_id, is_guest: false }
            });

            return order;
        });

        return res.status(201).json({ 
            status: true, 
            msg: 'Order placed successfully', 
            data: { ...orderResult, id: orderResult.id.toString() } 
        });

    } catch (e: any) {
        return res.status(500).json({ status: false, msg: e.message });
    }
};

/**
 * @Description Get User Order History
 * @Route GET /api/consumer/order/history
 * @Access Public
 */
export const getOrderHistory = async (req: Request, res: Response): Promise<any> => {
    const user_id = req.query.user_id ? Number(req.query.user_id) : null;
    
    if (!user_id) {
        return res.status(400).json({ status: false, msg: 'user_id is required' });
    }

    try {
        const orders = await prisma.orders.findMany({
            where: { user_id: user_id },
            orderBy: { id: 'desc' }
        });

        const mappedOrders = orders.map(order => ({
            ...order,
            id: order.id.toString()
        }));

        return res.status(200).json({ status: true, data: mappedOrders });
    } catch (e: any) {
        return res.status(500).json({ status: false, msg: e.message });
    }
};
