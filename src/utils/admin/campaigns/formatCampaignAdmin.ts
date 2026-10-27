import { publicMediaUrl } from '../../mediaStorage';

export function formatTimeOnly(value: Date | null | undefined): string | null {
  if (!value) return null;
  const h = value.getUTCHours().toString().padStart(2, '0');
  const m = value.getUTCMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

export function formatDateOnly(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

export function parseTimeToDb(time: string): Date {
  const parts = time.trim().split(':');
  const h = Number(parts[0] ?? 0);
  const m = Number(parts[1] ?? 0);
  const s = Number(parts[2] ?? 0);
  return new Date(Date.UTC(1970, 0, 1, h, m, s));
}

export function formatBasicCampaignRow(row: {
  id: bigint;
  title: string | null;
  image: string | null;
  description: string | null;
  status: boolean;
  start_date: Date | null;
  end_date: Date | null;
  start_time: Date | null;
  end_time: Date | null;
  created_at: Date | null;
}) {
  const startDate = formatDateOnly(row.start_date);
  const endDate = formatDateOnly(row.end_date);
  const startTime = formatTimeOnly(row.start_time);
  const endTime = formatTimeOnly(row.end_time);
  return {
    id: Number(row.id),
    title: row.title,
    description: row.description,
    image: publicMediaUrl(row.image),
    status: row.status,
    start_date: startDate,
    end_date: endDate,
    start_time: startTime,
    end_time: endTime,
    date_duration:
      startDate && endDate ? `${startDate} - ${endDate}` : startDate ?? endDate ?? '—',
    time_duration:
      startTime && endTime ? `${startTime} - ${endTime}` : startTime ?? endTime ?? '—',
    created_at: row.created_at,
  };
}

export function formatFoodCampaignRow(row: {
  id: bigint;
  title: string | null;
  image: string | null;
  description: string | null;
  status: boolean;
  start_date: Date | null;
  end_date: Date | null;
  start_time: Date | null;
  end_time: Date | null;
  price: unknown;
  restaurant_id: unknown;
  created_at: Date | null;
}) {
  const base = formatBasicCampaignRow(row);
  return {
    ...base,
    price: Number(row.price),
    restaurant_id: row.restaurant_id != null ? Number(row.restaurant_id) : null,
  };
}
