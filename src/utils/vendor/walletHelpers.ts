import { Prisma } from '@prisma/client';

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeRestaurantWalletBalance(input: {
  total_earning: number;
  total_withdrawn: number;
  pending_withdraw: number;
  collected_cash: number;
}): number {
  if (input.total_earning <= 0) return 0;
  return roundMoney(
    input.total_earning - input.total_withdrawn - input.pending_withdraw - input.collected_cash
  );
}

export function computeWithdrawableEarning(input: {
  total_earning: number;
  total_withdrawn: number;
  pending_withdraw: number;
}): number {
  return roundMoney(input.total_earning - input.total_withdrawn - input.pending_withdraw);
}

export function withdrawApprovedLabel(approved: number): string {
  if (approved === 1) return 'Approved';
  if (approved === 2) return 'Denied';
  return 'Pending';
}

export function parseMethodFieldsJson(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        out[k] = v == null ? '' : String(v);
      }
      return out;
    }
  } catch {
    /* ignore */
  }
  return {};
}

export function parseWithdrawalMethodFieldDefs(raw: string | null): Array<{
  input_name: string;
  input_type: string;
  placeholder: string;
  is_required: number;
}> {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => {
      const row = item as Record<string, unknown>;
      return {
        input_name: String(row.input_name ?? ''),
        input_type: String(row.input_type ?? 'text'),
        placeholder: String(row.placeholder ?? ''),
        is_required: Number(row.is_required ?? 0) ? 1 : 0,
      };
    });
  } catch {
    return [];
  }
}

export function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value == null) return 0;
  return Number(value);
}

export function toDecimal(value: number | string | bigint): Prisma.Decimal {
  if (typeof value === 'bigint') return new Prisma.Decimal(value.toString());
  return new Prisma.Decimal(value);
}
