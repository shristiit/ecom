// src/utils/errors.ts
export class AppError extends Error {
  statusCode: number;
  code?: string;
  details?: unknown;
  constructor(message: string, statusCode = 500, code?: string, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', details?: unknown) { super(message, 400, 'BAD_REQUEST', details); }
}
export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', details?: unknown) { super(message, 401, 'UNAUTHORIZED', details); }
}
export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', details?: unknown) { super(message, 403, 'FORBIDDEN', details); }
}
export class NotFoundError extends AppError {
  constructor(message = 'Not found', details?: unknown) { super(message, 404, 'NOT_FOUND', details); }
}
export class ConflictError extends AppError {
  constructor(message = 'Conflict', details?: unknown) { super(message, 409, 'CONFLICT', details); }
}
export class UnprocessableEntityError extends AppError {
  constructor(message = 'Unprocessable Entity', details?: unknown) { super(message, 422, 'UNPROCESSABLE_ENTITY', details); }
}

export function isMongoDuplicateKey(err: any): boolean {
  return err?.name === 'MongoServerError' && err?.code === 11000;
}

export function toAppError(err: any): AppError {
  if (isMongoDuplicateKey(err)) {
    const fields = Object.keys(err.keyPattern ?? {});
    const msg = fields.length
      ? `Duplicate value for unique field(s): ${fields.join(', ')}`
      : 'Duplicate key';
    return new ConflictError(msg, { keyValue: err.keyValue, keyPattern: err.keyPattern });
  }
  if (err?.name === 'ValidationError') return new UnprocessableEntityError('Validation failed', err?.errors);
  if (err?.name === 'ZodError') return new UnprocessableEntityError('Validation failed', err?.issues);
  if (err?.name === 'JsonWebTokenError' || err?.name === 'TokenExpiredError') return new UnauthorizedError(err.message);
  if (err instanceof AppError) return err;
  return new AppError(err?.message || 'Internal Server Error', 500);
}
