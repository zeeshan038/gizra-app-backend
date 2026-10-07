import { Response } from 'express';
import type { ValidationError } from 'joi';

export type ApiErrorBody = {
  status: false;
  msg: string;
};

export function apiErrorBody(msg: string): ApiErrorBody {
  return { status: false, msg };
}

export function joiFirstMessage(error: ValidationError, fallback = 'Validation failed'): string {
  return error.details[0]?.message ?? fallback;
}

export function sendApiError(res: Response, httpStatus: number, msg: string) {
  return res.status(httpStatus).json(apiErrorBody(msg));
}

export function errorMessageFromUnknown(e: unknown, fallback = 'Something went wrong'): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return fallback;
}
