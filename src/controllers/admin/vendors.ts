import { Request, Response } from 'express';
import prisma from '../../config/database';

/**
 * @Description Approve a pending vendor registration
 * @Route PUT /api/v1/admin/vendors/approve/:vendor_id
 * @Access Private (Admin)
 */
export const approveVendor = async (req: Request, res: Response): Promise<any> => {
    const { vendor_id } = req.params;

    if (!vendor_id) {
        return res.status(400).json({
            status: false,
            msg: "Vendor ID is required."
        });
    }

    try {
        // 1. Check if vendor exists
        const vendorIdStr = vendor_id as string;
        const vendor = await prisma.vendors.findUnique({
            where: { id: BigInt(vendorIdStr) }
        });

        if (!vendor) {
            return res.status(404).json({
                status: false,
                msg: "Vendor not found."
            });
        }

        if (vendor.status === true) {
            return res.status(400).json({
                status: false,
                msg: "Vendor is already approved."
            });
        }

        // 2. Safely update both vendor and their restaurant to approved
        await prisma.$transaction(async (prismaTx) => {
            // Approve Vendor
            await prismaTx.vendors.update({
                where: { id: BigInt(vendorIdStr) },
                data: {
                    status: true,
                    updated_at: new Date()
                }
            });

            // Approve their Restaurant(s)
            await prismaTx.restaurants.updateMany({
                where: { vendor_id: Number(vendorIdStr) },
                data: {
                    status: true,
                    updated_at: new Date()
                }
            });
        });

        return res.status(200).json({
            status: true,
            msg: "Vendor registration successfully approved."
        });

    } catch (error: any) {
        return res.status(500).json({
            status: false,
            msg: error.message
        });
    }
};
