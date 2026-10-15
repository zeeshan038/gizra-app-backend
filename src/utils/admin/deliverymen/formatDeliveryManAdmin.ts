import type { delivery_men } from '@prisma/client';

export function formatDeliveryManAdmin(row: delivery_men, zoneName?: string | null) {
  return {
    id: Number(row.id),
    f_name: row.f_name,
    l_name: row.l_name,
    name: [row.f_name, row.l_name].filter(Boolean).join(' '),
    phone: row.phone,
    email: row.email,
    identity_number: row.identity_number,
    zone_id: row.zone_id != null ? Number(row.zone_id) : null,
    zone: zoneName ?? null,
    status: row.status,
    active: row.active,
    earning: row.earning,
    application_status: row.application_status,
    order_count: Number(row.order_count),
    vehicle_id: row.vehicle_id != null ? Number(row.vehicle_id) : null,
    image: row.image,
    created_at: row.created_at,
  };
}
