import bcrypt from 'bcrypt';
import prisma from '../../../config/database';
import { provisionAccountStorage } from '../../accountStorage';
import { normalizeStoredMedia } from '../../mediaStorage';
import { packIdentityImagesForDb } from '../../deliveryman/registerHelpers';

export type AdminCreateDeliveryManInput = {
  f_name: string;
  l_name?: string | null;
  email: string;
  phone: string;
  password: string;
  zone_id: number;
  vehicle_id: number;
  earning: boolean;
  identity_type: string;
  identity_number: string;
  image?: string | null;
  identity_image?: string[];
};

export async function createAdminDeliveryMan(payload: AdminCreateDeliveryManInput) {
  const existing = await prisma.delivery_men.findFirst({
    where: {
      OR: [{ phone: payload.phone }, { email: payload.email }],
    },
    select: { id: true },
  });
  if (existing) {
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

  const hashedPassword = await bcrypt.hash(payload.password, 10);
  const cloudflareId = await provisionAccountStorage('deliveryman', undefined);

  const identityPaths = payload.identity_image?.filter(Boolean) ?? [];
  let identityStored: string;
  let additionalDocuments: string | undefined;
  if (identityPaths.length === 0) {
    identityStored = JSON.stringify([]);
  } else {
    const packed = packIdentityImagesForDb(identityPaths);
    identityStored = packed.identity_image;
    additionalDocuments = packed.additional_documents ?? undefined;
  }

  const profileImage = normalizeStoredMedia(payload.image ?? undefined, 'def.png', 100);
  const now = new Date();

  const dm = await prisma.$transaction(async (tx) => {
    const created = await tx.delivery_men.create({
      data: {
        f_name: payload.f_name,
        l_name: payload.l_name || null,
        email: payload.email,
        phone: payload.phone,
        password: hashedPassword,
        cloudflareId,
        identity_type: payload.identity_type,
        identity_number: payload.identity_number,
        zone_id: payload.zone_id,
        vehicle_id: payload.vehicle_id,
        earning: payload.earning,
        application_status: 'approved',
        status: true,
        active: false,
        type: 'zone_wise',
        identity_image: identityStored,
        additional_documents: additionalDocuments,
        image: profileImage,
        created_at: now,
        updated_at: now,
      },
    });

    await tx.delivery_man_wallets.create({
      data: {
        delivery_man_id: Number(created.id),
        created_at: now,
        updated_at: now,
      },
    });

    return created;
  });

  return { id: Number(dm.id) };
}
