import { Request, Response } from 'express';

import {
  restaurantActiveSchema,
  restaurantMetaSchema,
  restaurantScheduleSchema,
  restaurantSetupSchema,
  restaurantToggleSchema,
} from '../../schemas/vendor/RestaurantSetup';
import { getVendorContext } from '../../utils/vendor/context';
import { buildRestaurantSetupPayload } from '../../utils/vendor/restaurantSetup/buildSetup';
import { loadVendorRestaurant } from '../../utils/vendor/restaurantSetup/loadRestaurant';
import {
  addRestaurantScheduleSlot,
  removeRestaurantScheduleSlot,
} from '../../utils/vendor/restaurantSetup/schedule';
import { applyRestaurantToggleSetting } from '../../utils/vendor/restaurantSetup/toggleSetting';
import { setRestaurantActive } from '../../utils/vendor/restaurantSetup/updateActive';
import { applyRestaurantMetaFields } from '../../utils/vendor/restaurantSetup/updateMetaFields';
import { applyRestaurantSetupFields } from '../../utils/vendor/restaurantSetup/updateSetupFields';

function validationMsg(error: { details: Array<{ message: string }> }) {
  return error.details.map((d) => d.message).join(', ');
}

/**
 * @Description Get restaurant setup (config, toggles, schedules, meta, options)
 * @Route GET /api/vendor/restaurant/business-setup
 * @Access Vendor
 */
export const getRestaurantSetup = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) {
    return res.status(403).json({
       status: false, 
       msg: 'Restaurant context not found for vendor' });
  }

  try {
    const loaded = await loadVendorRestaurant(req);
    if (!loaded) {
      return res.status(404).json({
         status: false, msg: 
         'Restaurant not found for this vendor' });
    }
    const data = await buildRestaurantSetupPayload(loaded.restaurant.id);
    return res.status(200).json({ 
      status: true, 
      msg: 'Restaurant setup fetched successfully',
      data });
  } catch (e: any) {
    return res.status(500).json({ 
      status: false,
       msg: e.message });
  }
};

/**
 * @Description Open or temporarily close the restaurant (vendor panel toggle)
 * @Route PUT /api/vendor/restaurant/active-status
 * @Access Vendor
 */
export const updateRestaurantActive = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) {
    return res.status(403).json({ status: false, msg: 'Restaurant context not found for vendor' });
  }

  const validated = restaurantActiveSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validationMsg(validated.error) });
  }

  try {
    const loaded = await loadVendorRestaurant(req);
    if (!loaded) {
      return res.status(404).json({ status: false, msg: 'Restaurant not found for this vendor' });
    }

    const { active, msg } = await setRestaurantActive(loaded.restaurant.id, validated.value.closed);
    return res.status(200).json({ status: true, msg, data: { active } });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Toggle a restaurant setting (delivery, schedule order, veg, etc.)
 * @Route PUT /api/vendor/restaurant/setting-toggle
 * @Access Vendor
 */
export const updateRestaurantToggle = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) {
    return res.status(403).json({ status: false, msg: 'Restaurant context not found for vendor' });
  }

  const validated = restaurantToggleSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validationMsg(validated.error) });
  }

  const { key, status } = validated.value;

  try {
    const loaded = await loadVendorRestaurant(req);
    if (!loaded) {
      return res.status(404).json({ status: false, msg: 'Restaurant not found for this vendor' });
    }

    const toggleError = await applyRestaurantToggleSetting(loaded.restaurant, key, status);
    if (toggleError) {
      return res.status(toggleError.status).json({ status: false, msg: toggleError.msg });
    }

    return res.status(200).json({ status: true, msg: 'Restaurant settings updated' });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Update restaurant setup fields (GST, cuisines, delivery charges, etc.)
 * @Route PUT /api/vendor/restaurant/business-setup
 * @Access Vendor
 */
export const updateRestaurantSetup = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) {
    return res.status(403).json({ status: false, msg: 'Restaurant context not found for vendor' });
  }

  const validated = restaurantSetupSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validationMsg(validated.error) });
  }

  const body = validated.value;
  if (body.gst_status && !String(body.gst_code || '').trim()) {
    return res.status(400).json({ status: false, msg: 'GST number cannot be empty' });
  }

  try {
    const loaded = await loadVendorRestaurant(req);
    if (!loaded) {
      return res.status(404).json({ status: false, msg: 'Restaurant not found for this vendor' });
    }

    const setupError = await applyRestaurantSetupFields(loaded.restaurant, body);
    if (setupError) {
      return res.status(setupError.status).json({ status: false, msg: setupError.msg });
    }

    const data = await buildRestaurantSetupPayload(loaded.restaurant.id);
    return res.status(200).json({ status: true, msg: 'Restaurant settings updated', data });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Update restaurant SEO meta (title, description, image, translations)
 * @Route PUT /api/vendor/restaurant/meta-data
 * @Access Vendor
 */
export const updateRestaurantMeta = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) {
    return res.status(403).json({ status: false, msg: 'Restaurant context not found for vendor' });
  }

  const validated = restaurantMetaSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validationMsg(validated.error) });
  }

  const body = validated.value;
  if (!body.meta_title?.trim()) {
    return res.status(400).json({ status: false, msg: 'Default meta title is required' });
  }
  if (!body.meta_description?.trim()) {
    return res.status(400).json({ status: false, msg: 'Default meta description is required' });
  }

  try {
    const loaded = await loadVendorRestaurant(req);
    if (!loaded) {
      return res.status(404).json({ status: false, msg: 'Restaurant not found for this vendor' });
    }

    await applyRestaurantMetaFields(loaded.restaurant, body);

    const data = await buildRestaurantSetupPayload(loaded.restaurant.id);
    return res.status(200).json({ status: true, msg: 'Meta data updated', data });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Add an opening-hours slot for a day
 * @Route POST /api/vendor/restaurant/schedules
 * @Access Vendor
 */
export const addRestaurantSchedule = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) {
    return res.status(403).json({ status: false, msg: 'Restaurant context not found for vendor' });
  }

  const validated = restaurantScheduleSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validationMsg(validated.error) });
  }

  const { day, start_time, end_time } = validated.value;

  try {
    const loaded = await loadVendorRestaurant(req);
    if (!loaded) {
      return res.status(404).json({ status: false, msg: 'Restaurant not found for this vendor' });
    }

    const scheduleError = await addRestaurantScheduleSlot(
      Number(loaded.restaurant.id),
      day,
      start_time,
      end_time
    );
    if (scheduleError) {
      return res.status(scheduleError.status).json({ status: false, msg: scheduleError.msg });
    }

    const data = await buildRestaurantSetupPayload(loaded.restaurant.id);
    return res.status(200).json({ status: true, msg: 'Schedule added successfully', data });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Remove an opening-hours slot
 * @Route DELETE /api/vendor/restaurant/schedules/:scheduleId
 * @Access Vendor
 */
export const removeRestaurantSchedule = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) {
    return res.status(403).json({ status: false, msg: 'Restaurant context not found for vendor' });
  }

  const scheduleId = Number(req.params.scheduleId);

  try {
    const loaded = await loadVendorRestaurant(req);
    if (!loaded) {
      return res.status(404).json({ status: false, msg: 'Restaurant not found for this vendor' });
    }

    const scheduleError = await removeRestaurantScheduleSlot(
      Number(loaded.restaurant.id),
      scheduleId
    );
    if (scheduleError) {
      return res.status(scheduleError.status).json({ status: false, msg: scheduleError.msg });
    }

    const data = await buildRestaurantSetupPayload(loaded.restaurant.id);
    return res.status(200).json({ status: true, msg: 'Schedule removed successfully', data });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};
