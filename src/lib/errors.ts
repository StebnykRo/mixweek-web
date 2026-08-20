/**
 * docs/09-api.md §1 — the outward error shape. Details never leave the server:
 * no stack traces, no SQL, no table names, no hints about other tenants' data.
 */
export const ERROR_STATUS = {
  UNAUTHENTICATED: 401,
  MFA_REQUIRED: 401,
  STEP_UP_REQUIRED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_FAILED: 422,
  RATE_LIMITED: 429,
  EVENT_FULL: 409,
  EVENT_ENDED: 409,
  REGISTRATION_CLOSED: 422,
  BOOKING_CLOSED: 422,
  OUT_OF_STOCK: 409,
  LIMIT_EXCEEDED: 409,
  READ_ONLY: 503,
  INTERNAL: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  UNAUTHENTICATED: 'Authentication required',
  MFA_REQUIRED: 'Second factor required',
  STEP_UP_REQUIRED: 'Recent second-factor confirmation required',
  FORBIDDEN: 'Not allowed',
  NOT_FOUND: 'Not found',
  CONFLICT: 'Conflicting state',
  VALIDATION_FAILED: 'Request payload is invalid',
  RATE_LIMITED: 'Too many requests',
  EVENT_FULL: 'No places left for this event',
  EVENT_ENDED: 'This event has ended',
  REGISTRATION_CLOSED: 'Registration is closed for this event',
  BOOKING_CLOSED: 'Booking is closed for this activity',
  OUT_OF_STOCK: 'Not enough stock left',
  LIMIT_EXCEEDED: 'Limit exceeded',
  READ_ONLY: 'The platform is temporarily read-only',
  INTERNAL: 'Something went wrong',
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  /** Extra fields safe to expose (e.g. field-level validation issues). */
  readonly details?: unknown;
  /** Server-side only. Logged, never serialised. */
  readonly internal?: unknown;

  constructor(code: ErrorCode, message?: string, opts?: { details?: unknown; internal?: unknown }) {
    super(message ?? DEFAULT_MESSAGE[code]);
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.details = opts?.details;
    this.internal = opts?.internal;
  }
}

/** No access and "does not exist" are indistinguishable from the outside. */
export const notFound = (internal?: unknown) => new AppError('NOT_FOUND', undefined, { internal });
export const forbidden = (internal?: unknown) => new AppError('FORBIDDEN', undefined, { internal });
export const unauthenticated = () => new AppError('UNAUTHENTICATED');
export const conflict = (message?: string) => new AppError('CONFLICT', message);
