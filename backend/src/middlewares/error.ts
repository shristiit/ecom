import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const status = err?.status ?? 500;
  const message = err?.message ?? 'Internal server error';
  if (status >= 500) {
    console.error(err);
  }
  res.status(status).json({ message });
}
