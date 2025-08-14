export class AppError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export class InventoryError extends AppError {
  constructor(code: string, message?: string, status = 409) {
    super(status, message || code, code);
  }
}

export const ERR = {
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  INSUFFICIENT_INCOMING: 'INSUFFICIENT_INCOMING',
  NO_INCOMING_SOURCE: 'NO_INCOMING_SOURCE',
  NOT_FOUND: 'NOT_FOUND',
  INVALID_STATE: 'INVALID_STATE',
  BAD_INPUT: 'BAD_INPUT',
};
