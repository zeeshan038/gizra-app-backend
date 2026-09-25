import { Request } from 'express';

export function parseOrderIdParam(req: Request): string | null {
  const raw = req.params.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  return id ?? null;
}
