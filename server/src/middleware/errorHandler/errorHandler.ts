import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../../utils/AppError.js';
import { env } from '../../config/env.js';
import { recordServerError } from '../../modules/health/errorBuffer.js';

// mysql2 errors are plain objects with a `code`/`errno` (not a class hierarchy like Mongoose's
// driver errors), so we type-guard on shape instead of `instanceof`.
type MySqlError = { code?: string; errno?: number; sqlMessage?: string };
const isMySqlError = (err: unknown): err is MySqlError =>
  typeof err === 'object' && err !== null && ('code' in err || 'errno' in err);

// Drizzle never throws the raw mysql2 error itself — a failed query is wrapped in a
// DrizzleQueryError whose own `code`/`errno` are undefined, with the real driver error sitting in
// `.cause` (see seedDemoData.ts's identical unwrap for the same reason). Without this unwrap,
// isMySqlError(err) below is false for every query issued through db.insert/update/delete, so the
// ER_DUP_ENTRY/ER_NO_REFERENCED_ROW_2/ER_ROW_IS_REFERENCED_2 branches never actually fire and
// every one of these falls through to the masked generic 500.
const asMySqlError = (err: unknown): MySqlError | undefined => {
  if (isMySqlError(err)) return err;
  const cause = (err as { cause?: unknown } | null)?.cause;
  return isMySqlError(cause) ? cause : undefined;
};

export const errorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction) => {

  // If a response was already sent — e.g. a webhook handler that acks immediately with
  // res.sendStatus(200) before doing async work, then hits an error in that later work — there's
  // nothing left to send here. Calling res.status()/.json() again would throw "Cannot set headers
  // after they are sent", so just log and stop.
  if (res.headersSent) {
    console.error(err);
    return;
  }

  // A. CUSTOM OPERATIONAL ERRORS
  // Check if the error is an instance of our trusted custom error class (e.g., 401 Unauthorized, 404 Not Found)
  if (err instanceof AppError) {
    // Return the specific status code and custom message configured when the error was thrown
    return res.status(err.statusCode).json({ success: false, message: err.message });
  }

  // B. ZOD REQUEST VALIDATION ERRORS
  // Check if the incoming request payload failed a Zod schema validation parse check
  if (err instanceof ZodError) {
    // Return a 400 Bad Request along with clean, mapped key-value errors via .flatten().fieldErrors
    return res.status(400).json({ success: false, message: 'Validation failed', errors: err.flatten().fieldErrors });
  }

  const mysqlErr = asMySqlError(err);

  // C. MYSQL DUPLICATE KEY ERRORS
  // mysql2 reports a unique-constraint violation as code 'ER_DUP_ENTRY' (errno 1062) — the
  // relational equivalent of MongoDB's error code 11000. Same response shape as before, minus
  // Mongo's structured `keyValue` (mysql2 only gives a formatted message naming the key).
  if (mysqlErr?.code === 'ER_DUP_ENTRY') {
    // err.sqlMessage is raw MySQL text — can include internal table/key names and the actual
    // conflicting value. Masked in production the same way the generic 500 branch below is;
    // most call sites should never hit this at all now that user.service.ts pre-checks email
    // uniqueness, but any other unique index without an equivalent pre-check would otherwise
    // still leak here.
    return res.status(409).json({
      success: false,
      message: 'Duplicate value',
      detail: env.NODE_ENV === 'production' ? undefined : mysqlErr.sqlMessage,
    });
  }

  // D. OTHER MYSQL CONSTRAINT ERRORS (e.g. a required FK row was missing/deleted concurrently)
  if (mysqlErr?.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(400).json({ success: false, message: 'Referenced record does not exist' });
  }

  // D2. DELETE BLOCKED BY A DEPENDENT ROW (errno 1451) — e.g. deleting a user who still has
  // refresh tokens, tickets, or tasks referencing them. Every FK to `users.id` is RESTRICT (no
  // cascade) on purpose, so this is expected and should read as a clean, actionable 409, not a
  // masked 500.
  if (mysqlErr?.code === 'ER_ROW_IS_REFERENCED_2') {
    return res.status(409).json({
      success: false,
      message: 'This record is still referenced by other data and cannot be deleted.',
    });
  }

  // E. UNHANDLED INTERNAL SYSTEM ERRORS (FALLBACK)
  // Safely log the unhandled system error (like a database connection failure or syntax crash) to the server console
  console.error(err);
  recordServerError(req.method, req.originalUrl.split('?')[0], err);

  // Send a generic 500 status to the client, dynamically hiding or exposing the stack trace/message based on production environments
  return res.status(500).json({
    success: false,
    // Security Guard: Mask descriptive system errors in production to avoid leaking database architectures or paths to users
    message: env.NODE_ENV === 'production' ? 'Internal server error' : String((err as Error)?.message ?? err),
  });
};
