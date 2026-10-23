import { orders } from '@prisma/client';
import prisma from '../../config/database';
import { getBusinessSetting } from '../deliveryman/orderHelpers';
import { sendSmsMessage } from '../sms/smsModule';
import { buildOrderStatusDescription } from './orderStatusMessage';
import { isSmsNotificationEnabled } from './notificationSettings';

const DEFAULT_MANUAL_DISPATCH_DELIVERED_SMS =
  "Bon appétit! We were happy to serve you - Gizra Team. Didn't order directly through our app? Download it now to get your food even faster next time! {appStoreLink} {playStoreLink}";

function parseDeliveryAddress(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v != null) out[k] = String(v);
    }
    return out;
  } catch {
    return {};
  }
}

async function loadAppStoreLinks(): Promise<{ appStoreLink: string; playStoreLink: string }> {
  const raw = (await getBusinessSetting('react_download_apps_link_data')) ?? '';
  let appStoreLink = '';
  let playStoreLink = '';
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (typeof data.app_store_link === 'string') appStoreLink = data.app_store_link;
    if (typeof data.play_store_link === 'string') playStoreLink = data.play_store_link;
    if (typeof data.ios === 'string') appStoreLink = appStoreLink || data.ios;
    if (typeof data.android === 'string') playStoreLink = playStoreLink || data.android;
  } catch {
    /* optional */
  }
  return { appStoreLink: appStoreLink.trim(), playStoreLink: playStoreLink.trim() };
}

function applyAppLinkPlaceholders(text: string, links: { appStoreLink: string; playStoreLink: string }): string {
  return text
    .replace(/\{appStoreLink\}/g, links.appStoreLink)
    .replace(/\{playStoreLink\}/g, links.playStoreLink);
}

async function resolveCustomerPhone(order: orders): Promise<{ phone: string | null; userName: string }> {
  const addr = parseDeliveryAddress(order.delivery_address);
  const fromAddress = addr.contact_person_number?.trim() || addr.contact_person_phone?.trim() || null;

  if (order.is_manual_dispatch && fromAddress) {
    return {
      phone: fromAddress,
      userName: addr.contact_person_name?.trim() || 'Customer',
    };
  }

  if (order.user_id == null) {
    return { phone: fromAddress, userName: addr.contact_person_name?.trim() || 'Customer' };
  }

  const userId = Number(order.user_id);
  if (!Number.isFinite(userId)) {
    return { phone: fromAddress, userName: 'Customer' };
  }

  const user = await prisma.users.findUnique({
    where: { id: BigInt(userId) },
    select: { phone: true, f_name: true, l_name: true, email: true },
  });

  const walkInEmail = user?.email?.startsWith('walkin+restaurant');
  if (walkInEmail && fromAddress) {
    return {
      phone: fromAddress,
      userName: addr.contact_person_name?.trim() || 'Customer',
    };
  }

  const phone = user?.phone?.trim() || fromAddress;
  const userName = user
    ? `${user.f_name ?? ''} ${user.l_name ?? ''}`.trim() || 'Customer'
    : addr.contact_person_name?.trim() || 'Customer';

  return { phone, userName };
}

/**
 * PHP `Helpers::send_order_notification` customer SMS block (SMS4Free).
 * Sends on delivered / delivery_boy_delivered when customer_order_notification.sms_status is active.
 */
export async function sendOrderDeliveredSmsIfEnabled(
  order: orders,
  notifyStatus: string
): Promise<void> {
  if (order.order_status !== 'delivered') return;
  if (notifyStatus !== 'delivered' && notifyStatus !== 'delivery_boy_delivered') return;

  const smsOn = await isSmsNotificationEnabled('customer', 'customer_order_notification');
  if (!smsOn) {
    console.info('[sms order] skipped — customer SMS notifications inactive', { order_id: order.id });
    return;
  }

  const { phone, userName } = await resolveCustomerPhone(order);
  if (!phone) {
    console.warn('[sms order] skipped — no customer phone', { order_id: order.id });
    return;
  }

  let message: string;
  if (order.is_manual_dispatch) {
    const links = await loadAppStoreLinks();
    message = applyAppLinkPlaceholders(DEFAULT_MANUAL_DISPATCH_DELIVERED_SMS, links);
  } else {
    message = await buildOrderStatusDescription({
      status: notifyStatus,
      lang: 'he',
      user_name: userName,
      order_id: order.id.toString(),
    });
  }

  if (!message || message === '0') return;

  const ok = await sendSmsMessage(phone, message);
  console.info('[sms order] customer delivered', {
    order_id: order.id.toString(),
    phone,
    manual_dispatch: order.is_manual_dispatch,
    ok,
  });
}
