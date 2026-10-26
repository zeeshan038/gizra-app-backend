import prisma from '../../../config/database';
import { publicMediaUrl } from '../../mediaStorage';
import { parseIdentityImagePaths } from '../../deliveryman/registerHelpers';

export function unpackIdentityImages(
  identityImage: string | null | undefined,
  additionalDocs: string | null | undefined
): string[] {
  if (additionalDocs) {
    try {
      const parsed = JSON.parse(additionalDocs);
      if (Array.isArray(parsed.identity_images)) {
        return parsed.identity_images;
      }
    } catch {
      /* ignore JSON parse failure */
    }
  }
  return parseIdentityImagePaths(identityImage);
}

export async function getAdminDeliveryManDetail(id: number) {
  const dm = await prisma.delivery_men.findUnique({
    where: { id: BigInt(id) },
  });
  if (!dm) {
    return null;
  }

  const [zone, vehicle] = await Promise.all([
    dm.zone_id != null
      ? prisma.zones.findUnique({
          where: { id: BigInt(Number(dm.zone_id)) },
          select: { id: true, name: true },
        })
      : null,
    dm.vehicle_id != null
      ? prisma.vehicles.findUnique({
          where: { id: BigInt(Number(dm.vehicle_id)) },
          select: { id: true, type: true },
        })
      : null,
  ]);

  const rawIdentityImages = unpackIdentityImages(dm.identity_image, dm.additional_documents);
  const resolvedIdentityImages = rawIdentityImages.map((path) => publicMediaUrl(path)).filter(Boolean) as string[];

  return {
    id: Number(dm.id),
    f_name: dm.f_name ?? '',
    l_name: dm.l_name ?? '',
    name: [dm.f_name, dm.l_name].filter(Boolean).join(' '),
    email: dm.email ?? '',
    phone: dm.phone,
    identity_type: dm.identity_type ?? 'passport',
    identity_number: dm.identity_number ?? '',
    identity_images: resolvedIdentityImages,
    raw_identity_images: rawIdentityImages,
    image: dm.image ? publicMediaUrl(dm.image) : null,
    raw_image: dm.image ?? null,
    zone_id: dm.zone_id != null ? Number(dm.zone_id) : null,
    zone_name: zone?.name ?? null,
    vehicle_id: dm.vehicle_id != null ? Number(dm.vehicle_id) : null,
    vehicle_type: vehicle?.type ?? null,
    earning: dm.earning, // true = freelance, false = salary base
    status: dm.status,
    active: dm.active,
    application_status: dm.application_status,
    order_count: Number(dm.order_count ?? 0),
    created_at: dm.created_at,
    updated_at: dm.updated_at,
  };
}
