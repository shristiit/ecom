import { Request, Response, NextFunction } from 'express';
import { logger } from '@backend/utils/logger.js';

type PgLikeError = {
  code?: string;
  message?: string;
  detail?: string;
};

function toHttpError(err: any) {
  const statusFromError = Number(err?.status);
  if (Number.isInteger(statusFromError) && statusFromError >= 400 && statusFromError <= 599) {
    return { status: statusFromError, message: err?.message ?? 'Request failed' };
  }

  const pg = err as PgLikeError;
  // Common Postgres data/constraint errors we should surface as user input issues.
  if (pg?.code === '22P02') {
    return { status: 400, message: 'Invalid input format for one or more fields.' };
  }
  if (pg?.code === '23502') {
    return { status: 400, message: 'Missing required field.' };
  }
  if (pg?.code === '23503') {
    return { status: 400, message: 'Related record not found.' };
  }
  if (pg?.code === '23505') {
    return { status: 409, message: 'Duplicate value violates a unique constraint.' };
  }
  if (pg?.code === '23514') {
    return { status: 400, message: 'Input violates a data constraint.' };
  }

  return { status: 500, message: 'Internal server error' };
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const { status, message } = toHttpError(err);
  if (status >= 500) {
    logger.error({ err }, 'request failed');
  } else {
    logger.warn({ err, status }, 'request failed');
  }
  res.status(status).json({ message });
}
