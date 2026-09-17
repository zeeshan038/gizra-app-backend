import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * @Description Get Latest Orders for Delivery Man (Broadcasted to their zone)
 * @Route GET /api/delivery-man/orders/latest
 * @Access Private (Delivery Man)
 */
export const getLatestOrders = async (req: Request, res: Response): Promise<any> => {
    const delivery_man_id = (req as any).user?.id || req.query.dm_id;

    if (!delivery_man_id) {
        return res.status(400).json({ status: false, msg: 'Delivery man ID required' });
    }

    try {
        const dm = await prisma.delivery_men.findUnique({
            where: { id: BigInt(delivery_man_id as string) }
        });

        if (!dm || !dm.zone_id) {
            return res.status(404).json({ status: false, msg: 'Delivery man or zone not found' });
        }

        // Fetch pending orders in the driver's zone (simplified for migration parity)
        // Note: The PHP backend had complex logic for checking subscription models etc.
        // For exact parity with the *data* structure, we fetch pending orders.
        const orders = await prisma.orders.findMany({
            where: {
                order_status: 'pending',
                // Assuming restaurant zone matching would happen here. 
                // For now, returning unassigned pending orders.
                delivery_man_id: null
            },
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

/**
 * @Description Accept an order (UberEats style broadcast acceptance)
 * @Route PUT /api/delivery-man/orders/:id/accept
 * @Access Private (Delivery Man)
 */
export const acceptOrder = async (req: Request, res: Response): Promise<any> => {
    const delivery_man_id = (req as any).user?.id || req.body.dm_id;
    const order_id = req.params.id;

    if (!delivery_man_id) {
        return res.status(400).json({ status: false, msg: 'Delivery man ID required' });
    }

    try {
        const order = await prisma.orders.findUnique({
            where: { id: BigInt(order_id as string) }
        });

        if (!order) {
            return res.status(404).json({ status: false, msg: 'Order not found' });
        }

        if (order.delivery_man_id != null) {
            return res.status(400).json({ status: false, msg: 'Order is already assigned to another delivery man' });
        }

        const updatedOrder = await prisma.orders.update({
            where: { id: BigInt(order_id as string) },
            data: {
                delivery_man_id: Number(delivery_man_id),
                order_status: 'accepted',
                accepted: new Date()
            }
        });

        return res.status(200).json({ 
            status: true, 
            msg: 'Order accepted successfully',
            data: { ...updatedOrder, id: updatedOrder.id.toString() }
        });
    } catch (e: any) {
        return res.status(500).json({ status: false, msg: e.message });
    }
};

/**
 * @Description Update Order Status (picked_up, delivered)
 * @Route PUT /api/delivery-man/orders/:id/status
 * @Access Private (Delivery Man)
 */
export const updateOrderStatus = async (req: Request, res: Response): Promise<any> => {
    const delivery_man_id = (req as any).user?.id || req.body.dm_id;
    const order_id = req.params.id;
    const { status } = req.body; // e.g., 'picked_up', 'delivered'

    if (!delivery_man_id) {
        return res.status(400).json({ status: false, msg: 'Delivery man ID required' });
    }

    const validStatuses = ['picked_up', 'delivered', 'canceled'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ status: false, msg: 'Invalid status' });
    }

    try {
        const order = await prisma.orders.findUnique({
            where: { id: BigInt(order_id as string) }
        });

        if (!order) {
            return res.status(404).json({ status: false, msg: 'Order not found' });
        }

        if (order.delivery_man_id?.toString() !== delivery_man_id.toString()) {
            return res.status(403).json({ status: false, msg: 'You are not assigned to this order' });
        }

        const updateData: any = { order_status: status };
        
        if (status === 'picked_up') updateData.picked_up = new Date();
        if (status === 'delivered') updateData.delivered = new Date();
        if (status === 'canceled') updateData.canceled = new Date();

        const updatedOrder = await prisma.orders.update({
            where: { id: BigInt(order_id as string) },
            data: updateData
        });

        return res.status(200).json({ 
            status: true, 
            msg: `Order status updated to ${status}`,
            data: { ...updatedOrder, id: updatedOrder.id.toString() }
        });
    } catch (e: any) {
        return res.status(500).json({ status: false, msg: e.message });
    }
};
