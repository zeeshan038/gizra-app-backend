import prisma from '../../../config/database';
import {
  RESTAURANT_CONFIG_TOGGLE_KEY_SET,
  RestaurantToggleKey,
  VendorRestaurantRow,
  VendorSetupActionError,
} from '../../../types/vendor/restaurantSetup';
import { getBusinessSetting, getBusinessSettingFlag } from '../../consumer/businessSettings';
import { ensureRestaurantConfig, selfDeliveryEnabled } from './loadRestaurant';
import { writeManualDispatch } from './manualDispatch';

export async function applyRestaurantToggleSetting(
  restaurant: VendorRestaurantRow,
  key: RestaurantToggleKey,
  status: boolean
): Promise<VendorSetupActionError | null> {
  const rid = Number(restaurant.id);
  const config = await prisma.restaurant_configs.findFirst({ where: { restaurant_id: rid } });

  if (key === 'schedule_order' && status && !(await getBusinessSettingFlag('schedule_order'))) {
    const raw = await getBusinessSetting('schedule_order');
    if (raw === '0' || raw === 'false') {
      return { status: 400, msg: 'Schedule order is disabled by admin' };
    }
  }
  if (key === 'delivery' && status) {
    const raw = await getBusinessSetting('home_delivery');
    if (raw === '0' || raw === 'false') {
      return { status: 400, msg: 'Home delivery is disabled by admin' };
    }
  }
  if (key === 'take_away' && status) {
    const raw = await getBusinessSetting('take_away');
    if (raw === '0' || raw === 'false') {
      return { status: 400, msg: 'Takeaway is disabled by admin' };
    }
  }
  if (key === 'dine_in' && status) {
    const raw = await getBusinessSetting('dine_in_order_option');
    if (raw === '0' || raw === 'false') {
      return { status: 400, msg: 'Dine-in is disabled by admin' };
    }
  }
  if (key === 'instant_order' && status) {
    const raw = await getBusinessSetting('instant_order');
    if (raw === '0' || raw === 'false') {
      return { status: 400, msg: 'Instant order is disabled by admin' };
    }
  }

  if (
    !status &&
    ((key === 'delivery' && !restaurant.take_away) || (key === 'take_away' && !restaurant.delivery))
  ) {
    return { status: 400, msg: 'You cannot disable both takeaway and home delivery' };
  }

  const instantOn = Boolean(config?.instant_order);
  const instantSetting = await getBusinessSetting('instant_order');
  const instantGloballyOn = instantSetting == null || instantSetting === '1' || instantSetting === 'true';
  if (
    !status &&
    instantGloballyOn &&
    ((key === 'instant_order' && !restaurant.schedule_order) ||
      (key === 'schedule_order' && !instantOn))
  ) {
    return { status: 400, msg: 'You cannot disable both instant order and scheduled delivery' };
  }

  if (
    !status &&
    ((key === 'veg' && !restaurant.non_veg) || (key === 'non_veg' && !restaurant.veg))
  ) {
    return { status: 400, msg: 'You cannot disable both veg and non-veg' };
  }

  if (key === 'free_delivery') {
    const allowed = await selfDeliveryEnabled(restaurant, rid);
    if (!allowed) {
      return { status: 400, msg: 'Your business plan does not include this feature' };
    }
  }

  if (key === 'manual_dispatch') {
    try {
      await writeManualDispatch(restaurant.id, status);
    } catch {
      return { status: 400, msg: 'Manual dispatch is not available for this restaurant' };
    }
    return null;
  }

  if (RESTAURANT_CONFIG_TOGGLE_KEY_SET.has(key)) {
    const conf = await ensureRestaurantConfig(rid);
    await prisma.restaurant_configs.update({
      where: { id: conf.id },
      data: { [key]: status, updated_at: new Date() },
    });
    return null;
  }

  await prisma.restaurants.update({
    where: { id: restaurant.id },
    data: { [key]: status, updated_at: new Date() },
  });
  return null;
}
