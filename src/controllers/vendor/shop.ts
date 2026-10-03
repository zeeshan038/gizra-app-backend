import { Request, Response } from 'express';
import { shopAnnouncementSchema, shopUpdateSchema } from '../../schemas/vendor/Shop';
import { getVendorContext } from '../../utils/vendor/context';
import { loadVendorRestaurant } from '../../utils/vendor/restaurantSetup/loadRestaurant';
import { applyShopFields } from '../../utils/vendor/shop/applyShopFields';
import { buildVendorShopPayload } from '../../utils/vendor/shop/buildShopPayload';
import prisma from '../../config/database';

function validationMsg(error: { details: Array<{ message: string }> }) {
  return error.details.map((d) => d.message).join(', ');
}

/**
 * @Description Get shop profile (My Shop details screen)
 * @Route GET /api/vendor/shop
 * @Access Vendor
 */
export const getVendorShop = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) {
    return res.status(403).json({ status: false, msg: 'Restaurant context not found for vendor' });
  }

  try {
    const loaded = await loadVendorRestaurant(req);
    if (!loaded) {
      return res.status(404).json({ status: false, msg: 'Restaurant not found for this vendor' });
    }

    const data = await buildVendorShopPayload(loaded.restaurant);
    return res.status(200).json({
      status: true,
      msg: 'Shop details fetched successfully',
      data,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to fetch shop details';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Description Update shop profile (Edit Shop form)
 * @Route PUT /api/vendor/shop
 * @Access Vendor
 */
export const updateVendorShop = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) {
    return res.status(403).json({ status: false, msg: 'Restaurant context not found for vendor' });
  }

  const validated = shopUpdateSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validationMsg(validated.error) });
  }

  if (!validated.value.address.trim()) {
    return res.status(400).json({ status: false, msg: 'Restaurant address is required' });
  }

  try {
    const loaded = await loadVendorRestaurant(req);
    if (!loaded) {
      return res.status(404).json({ status: false, msg: 'Restaurant not found for this vendor' });
    }

    const updateError = await applyShopFields(loaded.restaurant, validated.value);
    if (updateError) {
      return res.status(updateError.status).json({ status: false, msg: updateError.msg });
    }

    const refreshed = await prisma.restaurants.findUnique({ where: { id: loaded.restaurant.id } });
    if (!refreshed) {
      return res.status(404).json({ status: false, msg: 'Restaurant not found for this vendor' });
    }

    const data = await buildVendorShopPayload(refreshed);
    return res.status(200).json({
      status: true,
      msg: 'Restaurant information updated successfully',
      data,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to update shop';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Description Publish shop announcement (My Shop screen)
 * @Route PUT /api/vendor/shop/announcement
 * @Access Vendor
 */
export const updateShopAnnouncement = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) {
    return res.status(403).json({ status: false, msg: 'Restaurant context not found for vendor' });
  }

  const validated = shopAnnouncementSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validationMsg(validated.error) });
  }

  const { announcement, announcement_message: announcementMessage } = validated.value;

  try {
    const loaded = await loadVendorRestaurant(req);
    if (!loaded) {
      return res.status(404).json({ status: false, msg: 'Restaurant not found for this vendor' });
    }

    const refreshed = await prisma.restaurants.update({
      where: { id: loaded.restaurant.id },
      data: {
        announcement,
        announcement_message: announcement ? announcementMessage.trim() : announcementMessage.trim() || null,
        updated_at: new Date(),
      },
    });

    const data = await buildVendorShopPayload(refreshed);
    return res.status(200).json({
      status: true,
      msg: 'Announcement updated successfully',
      data,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to update announcement';
    return res.status(500).json({ status: false, msg });
  }
};
