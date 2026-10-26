import bcrypt from 'bcrypt';
import prisma from '../../../config/database';
import { normalizeStoredMedia } from '../../mediaStorage';
import { packIdentityImagesForDb } from '../../deliveryman/registerHelpers';

export type AdminUpdateDeliveryManInput = {
  f_name: string;
  l_name?: string | null;
  email: string;
  phone: string;
  password?: string | null;
  zone_id: number;
  vehicle_id: number;
  earning: boolean;
  identity_type: string;
  identity_number: string;
  image?: string | null;
  identity_image?: string[];
};

export async function updateAdminDeliveryMan(id: number, payload: AdminUpdateDeliveryManInput) {
  const dm = await prisma.delivery_men.findUnique({
    where: { id: BigInt(id) },
  });
  if (!dm) {
    throw new Error('Delivery man not found');
  }

  const existingConflict = await prisma.delivery_men.findFirst({
    where: {
      OR: [{ phone: payload.phone }, { email: payload.email }],
      NOT: { id: BigInt(id) },
    },
    select: { id: true },
  });
  if (existingConflict) {
    throw new Error('Phone or email already exists');
  }

  const zone = await prisma.zones.findFirst({
    where: { id: BigInt(payload.zone_id), status: true },
    select: { id: true },
  });
  if (!zone) {
    throw new Error('Invalid or inactive zone');
  }

  const vehicle = await prisma.vehicles.findFirst({
    where: { id: BigInt(payload.vehicle_id), status: true },
    select: { id: true },
  });
  if (!vehicle) {
    throw new Error('Invalid or inactive vehicle');
  }

  const now = new Date();
  const updateData: any = {
    f_name: payload.f_name,
    l_name: payload.l_name || null,
    email: payload.email,
    phone: payload.phone,
    zone_id: payload.zone_id,
    vehicle_id: payload.vehicle_id,
    earning: payload.earning,
    identity_type: payload.identity_type,
    identity_number: payload.identity_number,
    updated_at: now,
  };

  if (payload.password?.trim()) {
    updateData.password = await bcrypt.hash(payload.password.trim(), 10);
  }

  if (payload.image !== undefined) {
    updateData.image = payload.image
      ? normalizeStoredMedia(payload.image, dm.image ?? 'def.png', 100)
      : dm.image;
  }

  if (payload.identity_image !== undefined) {
    const identityPaths = payload.identity_image.filter(Boolean);
    if (identityPaths.length === 0) {
      updateData.identity_image = JSON.stringify([]);
      updateData.additional_documents = null;
    } else {
      const packed = packIdentityImagesForDb(identityPaths);
      updateData.identity_image = packed.identity_image;
      updateData.additional_documents = packed.additional_documents ?? null;
    }
  }

  const updated = await prisma.delivery_men.update({
    where: { id: BigInt(id) },
    data: updateData,
  });

  return updated;
}
