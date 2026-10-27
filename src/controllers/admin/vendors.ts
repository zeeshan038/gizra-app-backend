import { Request, Response } from 'express';
import prisma from '../../config/database';
import { publicRestaurantMediaUrl } from '../../utils/mediaStorage';
import { sendVendorRegistrationDecisionPush } from '../../utils/notifications/sendRegistrationDecisionPush';

/**
 * @Description List vendors with restaurant summary (pending approval first)
 * @Route GET /api/admin/vendors/list
 */
export const listVendors = async (req: Request, res: Response): Promise<any> => {
  const statusFilter = String(req.query.status ?? 'all');
  try {
    const vendors = await prisma.vendors.findMany({
      where:
        statusFilter === 'pending'
          ? { OR: [{ status: false }, { status: null }] }
          : statusFilter === 'approved'
            ? { status: true }
            : {},
      orderBy: [{ status: 'asc' }, { id: 'desc' }],
      take: 200,
    });

    const vendorIds = vendors.map((v) => Number(v.id));
    const restaurants =
      vendorIds.length > 0
        ? await prisma.restaurants.findMany({
            where: { vendor_id: { in: vendorIds } },
            select: {
              id: true,
              name: true,
              vendor_id: true,
              logo: true,
              status: true,
              zone_id: true,
              phone: true,
            },
          })
        : [];

    const restaurantsByVendor = new Map<number, (typeof restaurants)[number][]>();
    for (const r of restaurants) {
      const vid = Number(r.vendor_id);
      const list = restaurantsByVendor.get(vid) ?? [];
      list.push(r);
      restaurantsByVendor.set(vid, list);
    }

    const data = vendors.map((v) => {
      const vid = Number(v.id);
      const rests = restaurantsByVendor.get(vid) ?? [];
      const primary = rests[0];
      return {
        id: v.id.toString(),
        f_name: v.f_name,
        l_name: v.l_name,
        email: v.email,
        phone: v.phone,
        status: v.status === true,
        created_at: v.created_at,
        restaurant: primary
          ? {
              id: primary.id.toString(),
              name: primary.name,
              phone: primary.phone,
              zone_id: primary.zone_id != null ? Number(primary.zone_id) : null,
              status: primary.status,
              logo: publicRestaurantMediaUrl(primary.logo, 'logo'),
            }
          : null,
        restaurant_count: rests.length,
      };
    });

    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (error: any) {
    return res.status(500).json({ status: false, msg: error.message });
  }
};

/**
 * @Description Approve a pending vendor registration
 * @Route PUT /api/admin/vendors/approve/:vendor_id
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

        void sendVendorRegistrationDecisionPush(Number(vendorIdStr), 'approved').catch((err) =>
          console.error('[notify] vendor registration push failed', err)
        );

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
