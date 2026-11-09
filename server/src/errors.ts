import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ZodError } from 'zod';
import type { ApiErrorBody, ApiErrorCode } from './contract.js';

/** Default HTTP status for each error code. */
export const STATUS_BY_CODE: Record<ApiErrorCode, ContentfulStatusCode> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  PAYLOAD_TOO_LARGE: 413,
  LEAVE_PIN_INVALID: 403,
  LEAVE_PIN_LOCKED: 429,
  AI_REFUSED: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  PROVIDER_ERROR: 502,
  AI_NOT_CONFIGURED: 503,
  STT_NOT_CONFIGURED: 503,
  TTS_NOT_CONFIGURED: 503,
  TIMEOUT: 504,
};

/** Thrown anywhere in a handler; rendered by app.onError as `{ error: { code, message } }`. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: ContentfulStatusCode;

  constructor(code: ApiErrorCode, message: string, status?: ContentfulStatusCode) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status ?? STATUS_BY_CODE[code];
  }
}

export function errorBody(code: ApiErrorCode, message: string): ApiErrorBody {
  return { error: { code, message } };
}

/** Human-readable zod issues (paths + messages only; zod v4 messages never echo input values). */
export function describeZodError(error: ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => {
      const where = issue.path.length ? issue.path.join('.') : 'body';
      return `${where}: ${issue.message}`;
    })
    .join('; ');
}
