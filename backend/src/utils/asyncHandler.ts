import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wrap async route handlers and forward errors to Express.
 * Usage: r.get('/', asyncHandler(async (req,res) => { ... }))
 */
export default function asyncHandler<T extends RequestHandler>(fn: T): RequestHandler {
  return function wrapped(req: Request, res: Response, next: NextFunction) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
