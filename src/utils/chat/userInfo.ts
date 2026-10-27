import prisma from '../../config/database';
import { normalizeStoredMedia } from '../mediaStorage';
import { toNum } from './ids';

export async function getOrCreateCustomerUserInfo(userId: number) {
  let row = await prisma.user_infos.findFirst({
    where: { user_id: userId },
  });
  if (row) return row;

  const user = await prisma.users.findUnique({
    where: { id: BigInt(userId) },
    select: {
      f_name: true,
      l_name: true,
      phone: true,
      email: true,
      image: true,
    },
  });
  if (!user) throw new Error('user_not_found');

  const now = new Date();
  row = await prisma.user_infos.create({
    data: {
      user_id: userId,
      f_name: user.f_name,
      l_name: user.l_name,
      phone: user.phone,
      email: user.email,
      image: user.image,
      created_at: now,
      updated_at: now,
    },
  });
  return row;
}

export async function getOrCreateVendorUserInfo(vendorId: number) {
  let row = await prisma.user_infos.findFirst({
    where: { vendor_id: vendorId },
  });
  if (row) return row;

  const vendor = await prisma.vendors.findUnique({
    where: { id: BigInt(vendorId) },
    select: { id: true, phone: true, email: true },
  });
  if (!vendor) throw new Error('vendor_not_found');

  const restaurant = await prisma.restaurants.findFirst({
    where: { vendor_id: vendorId },
    select: { name: true, logo: true },
  });

  const now = new Date();
  row = await prisma.user_infos.create({
    data: {
      vendor_id: vendorId,
      f_name: restaurant?.name ?? 'Restaurant',
      l_name: '',
      phone: vendor.phone,
      email: vendor.email,
      image: restaurant?.logo ?? null,
      created_at: now,
      updated_at: now,
    },
  });
  return row;
}

export async function getOrCreateDeliveryManUserInfo(deliveryManId: number) {
  let row = await prisma.user_infos.findFirst({
    where: { deliveryman_id: deliveryManId },
  });
  if (row) return row;

  const dm = await prisma.delivery_men.findUnique({
    where: { id: BigInt(deliveryManId) },
    select: {
      f_name: true,
      l_name: true,
      phone: true,
      email: true,
      image: true,
    },
  });
  if (!dm) throw new Error('delivery_man_not_found');

  const now = new Date();
  row = await prisma.user_infos.create({
    data: {
      deliveryman_id: deliveryManId,
      f_name: dm.f_name,
      l_name: dm.l_name,
      phone: dm.phone,
      email: dm.email,
      image: dm.image,
      created_at: now,
      updated_at: now,
    },
  });
  return row;
}

export async function loadUserInfoById(id: number) {
  return prisma.user_infos.findUnique({ where: { id: BigInt(id) } });
}

export function userInfoId(row: { id: bigint }) {
  return Number(row.id);
}

export function customerUserIdFromInfo(row: { user_id: unknown }) {
  return toNum(row.user_id as never);
}
