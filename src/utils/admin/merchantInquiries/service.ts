import prisma from '../../../config/database';

export type MerchantInquiryRow = {
  id: number;
  business_name: string;
  contact_person: string;
  phone: string;
  email: string | null;
  business_type: string;
  seen: boolean;
  created_at: string;
};

function mapRow(row: {
  id: bigint;
  business_name: string;
  contact_person: string;
  phone: string;
  email: string | null;
  business_type: string;
  seen: boolean;
  created_at: Date;
}): MerchantInquiryRow {
  return {
    id: Number(row.id),
    business_name: row.business_name,
    contact_person: row.contact_person,
    phone: row.phone,
    email: row.email,
    business_type: row.business_type,
    seen: row.seen,
    created_at: row.created_at.toISOString(),
  };
}

export async function createMerchantInquiry(input: {
  business_name: string;
  contact_person: string;
  phone: string;
  email?: string;
  business_type: string;
}): Promise<MerchantInquiryRow> {
  const row = await prisma.merchant_inquiries.create({
    data: {
      business_name: input.business_name,
      contact_person: input.contact_person,
      phone: input.phone,
      email: input.email?.trim() || null,
      business_type: input.business_type,
    },
  });
  return mapRow(row);
}

export async function listMerchantInquiries(params: {
  page?: number;
  limit?: number;
  unseen_only?: boolean;
}): Promise<{ data: MerchantInquiryRow[]; total: number; page: number; limit: number }> {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const skip = (page - 1) * limit;
  const where = params.unseen_only ? { seen: false } : {};

  const [rows, total] = await Promise.all([
    prisma.merchant_inquiries.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take: limit,
    }),
    prisma.merchant_inquiries.count({ where }),
  ]);

  return {
    data: rows.map(mapRow),
    total,
    page,
    limit,
  };
}

export async function getMerchantInquiryAlert() {
  const [unseen, latest] = await Promise.all([
    prisma.merchant_inquiries.count({ where: { seen: false } }),
    prisma.merchant_inquiries.findFirst({
      where: { seen: false },
      orderBy: { id: 'desc' },
      select: { id: true, business_name: true },
    }),
  ]);

  return {
    enabled: true,
    unseen,
    play_sound: unseen > 0,
    latest_id: latest ? Number(latest.id) : null,
    latest_business_name: latest?.business_name ?? null,
    type: 'merchant_inquiry',
  };
}

export async function markMerchantInquirySeen(id: number): Promise<boolean> {
  if (!Number.isFinite(id) || id <= 0) return false;
  const updated = await prisma.merchant_inquiries.updateMany({
    where: { id: BigInt(id) },
    data: { seen: true },
  });
  return updated.count > 0;
}

export async function markAllMerchantInquiriesSeen(): Promise<number> {
  const updated = await prisma.merchant_inquiries.updateMany({
    where: { seen: false },
    data: { seen: true },
  });
  return updated.count;
}
