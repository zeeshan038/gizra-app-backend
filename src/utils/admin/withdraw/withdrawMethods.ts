import prisma from '../../../config/database';
import { parseWithdrawalMethodFieldDefs } from '../../vendor/walletHelpers';

export type WithdrawMethodFieldInput = {
  input_type: string;
  input_name: string;
  placeholder: string;
  is_required?: boolean | number;
};

function toBoolFlag(value: unknown, fallback = false): number {
  if (value === true || value === 1 || value === '1') return 1;
  if (value === false || value === 0 || value === '0') return 0;
  return fallback ? 1 : 0;
}

export function normalizeMethodFields(fields: WithdrawMethodFieldInput[]) {
  return fields.map((field) => {
    const rawName = String(field.input_name || '').trim();
    const input_name = rawName.toLowerCase().replace(/\s+/g, '_');
    let input_type = String(field.input_type || 'string').toLowerCase();
    if (input_type === 'text') input_type = 'string';
    return {
      input_type,
      input_name,
      placeholder: String(field.placeholder ?? ''),
      is_required: toBoolFlag(field.is_required, true),
    };
  });
}

function mapRow(row: {
  id: bigint;
  method_name: string;
  method_fields: string;
  is_default: number;
  is_active: number;
  created_at: Date | null;
  updated_at: Date | null;
}) {
  return {
    id: Number(row.id),
    method_name: row.method_name,
    method_fields: parseWithdrawalMethodFieldDefs(row.method_fields),
    is_default: Number(row.is_default) === 1 ? 1 : 0,
    is_active: Number(row.is_active) === 1 ? 1 : 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listWithdrawMethods(input: {
  search?: string;
  page: number;
  limit: number;
}) {
  const search = String(input.search ?? '').trim();
  const skip = (input.page - 1) * input.limit;
  const where = search
    ? {
        method_name: { contains: search, mode: 'insensitive' as const },
      }
    : {};

  const [total, rows] = await Promise.all([
    prisma.withdrawal_methods.count({ where }),
    prisma.withdrawal_methods.findMany({
      where,
      orderBy: { id: 'desc' },
      skip,
      take: input.limit,
    }),
  ]);

  return {
    data: rows.map(mapRow),
    total,
    page: input.page,
    limit: input.limit,
  };
}

export async function getWithdrawMethod(id: number) {
  const row = await prisma.withdrawal_methods.findUnique({ where: { id: BigInt(id) } });
  return row ? mapRow(row) : null;
}

export async function createWithdrawMethod(input: {
  method_name: string;
  is_default?: boolean | number;
  method_fields: WithdrawMethodFieldInput[];
}) {
  const method_fields = normalizeMethodFields(input.method_fields);
  const count = await prisma.withdrawal_methods.count();
  const wantDefault = toBoolFlag(input.is_default, false) === 1 || count === 0;
  const now = new Date();

  const existing = await prisma.withdrawal_methods.findFirst({
    where: { method_name: input.method_name },
  });

  const row = await prisma.$transaction(async (tx) => {
    if (wantDefault) {
      await tx.withdrawal_methods.updateMany({ data: { is_default: 0, updated_at: now } });
    }

    if (existing) {
      return tx.withdrawal_methods.update({
        where: { id: existing.id },
        data: {
          method_fields: JSON.stringify(method_fields),
          is_default: wantDefault ? 1 : Number(existing.is_default) === 1 ? 1 : 0,
          is_active: 1,
          updated_at: now,
        },
      });
    }

    return tx.withdrawal_methods.create({
      data: {
        method_name: input.method_name,
        method_fields: JSON.stringify(method_fields),
        is_default: wantDefault ? 1 : 0,
        is_active: 1,
        created_at: now,
        updated_at: now,
      },
    });
  });

  return mapRow(row);
}

export async function updateWithdrawMethod(
  id: number,
  input: {
    method_name: string;
    is_default?: boolean | number;
    method_fields: WithdrawMethodFieldInput[];
  }
) {
  const existing = await prisma.withdrawal_methods.findUnique({ where: { id: BigInt(id) } });
  if (!existing) return null;

  const method_fields = normalizeMethodFields(input.method_fields);
  const wantDefault = toBoolFlag(input.is_default, false) === 1;
  const now = new Date();

  const row = await prisma.$transaction(async (tx) => {
    if (wantDefault) {
      await tx.withdrawal_methods.updateMany({
        where: { NOT: { id: existing.id } },
        data: { is_default: 0, updated_at: now },
      });
    }

    return tx.withdrawal_methods.update({
      where: { id: existing.id },
      data: {
        method_name: input.method_name,
        method_fields: JSON.stringify(method_fields),
        is_default: wantDefault ? 1 : 0,
        updated_at: now,
      },
    });
  });

  return mapRow(row);
}

export async function setWithdrawMethodActive(id: number, is_active: 0 | 1) {
  const existing = await prisma.withdrawal_methods.findUnique({ where: { id: BigInt(id) } });
  if (!existing) return null;

  const row = await prisma.withdrawal_methods.update({
    where: { id: existing.id },
    data: { is_active, updated_at: new Date() },
  });
  return mapRow(row);
}

export async function setWithdrawMethodDefault(id: number, is_default: 0 | 1) {
  const existing = await prisma.withdrawal_methods.findUnique({ where: { id: BigInt(id) } });
  if (!existing) return { ok: false as const, reason: 'not_found' as const };

  if (is_default === 0 && Number(existing.is_default) === 1) {
    return { ok: false as const, reason: 'cannot_unset' as const };
  }

  const now = new Date();
  const row = await prisma.$transaction(async (tx) => {
    if (is_default === 1) {
      await tx.withdrawal_methods.updateMany({
        where: { NOT: { id: existing.id } },
        data: { is_default: 0, updated_at: now },
      });
    }
    return tx.withdrawal_methods.update({
      where: { id: existing.id },
      data: { is_default, updated_at: now },
    });
  });

  return { ok: true as const, data: mapRow(row) };
}

export async function deleteWithdrawMethod(id: number) {
  const existing = await prisma.withdrawal_methods.findUnique({ where: { id: BigInt(id) } });
  if (!existing) return false;
  await prisma.withdrawal_methods.delete({ where: { id: existing.id } });
  return true;
}
