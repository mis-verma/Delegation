import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../../utils/AppError.js';
import { env } from '../../config/env.js';
import { recordServerError } from '../../modules/health/errorBuffer.js';

type MySqlError = { code?: string; errno?: number; sqlMessage?: string };

const isMySqlError = (err: unknown): err is MySqlError =>
  typeof err === 'object' && err !== null && ('code' in err || 'errno' in err);

const asMySqlError = (err: unknown): MySqlError | undefined => {
  if (isMySqlError(err)) return err;
  const cause = (err as { cause?: unknown } | null)?.cause;
  return isMySqlError(cause) ? cause : undefined;
};

const humaniseSegment = (segment: string): string =>
  segment.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase();

const describeZodError = (err: ZodError): string => {
  const issue = err.issues[0];
  if (!issue) return 'Some details are not valid. Please check the form and try again.';

  const path = issue.path;
  if (!path.length) return issue.message || 'Validation failed';

  const parts: string[] = [];
  let rest = path;

  if (path[0] === 'items' && typeof path[1] === 'number') {
    parts.push(`Question ${path[1] + 1}`);
    rest = path.slice(2);
  }

  const formattedParts = rest.map((p) =>
    typeof p === 'number' ? `#${p + 1}` : humaniseSegment(String(p))
  );

  if (formattedParts.length) {
    const fieldLabel = formattedParts.join(' ');
    parts.push(parts.length ? fieldLabel : fieldLabel.charAt(0).toUpperCase() + fieldLabel.slice(1));
  }

  const message = issue.message || 'is not valid';
  return parts.length ? `${parts.join(', ')}: ${message}` : message;
};

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (res.headersSent) {
    console.error(err);
    return;
  }

  // 1. Custom Operational Errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
    return;
  }

  // 2. Schema Validation Errors (Zod)
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      message: describeZodError(err),
      errors: err.flatten().fieldErrors,
    });
    return;
  }

  // 3. MySQL Database Foreign Key & Unique Constraint Errors
  const mysqlErr = asMySqlError(err);

  if (mysqlErr?.code === 'ER_DUP_ENTRY') {
    res.status(409).json({
      success: false,
      message: 'Duplicate value',
      detail: env.NODE_ENV === 'production' ? undefined : mysqlErr.sqlMessage,
    });
    return;
  }

  if (mysqlErr?.code === 'ER_NO_REFERENCED_ROW_2') {
    res.status(400).json({
      success: false,
      message: 'Referenced record does not exist',
    });
    return;
  }

  if (mysqlErr?.code === 'ER_ROW_IS_REFERENCED_2') {
    res.status(409).json({
      success: false,
      message: 'This record is still referenced by other data and cannot be deleted.',
    });
    return;
  }

  // 4. Unexpected / Server Errors
  console.error(err);
  const pathWithoutQuery = req.originalUrl ? req.originalUrl.split('?')[0] : req.url;
  recordServerError(req.method, pathWithoutQuery, err);

  res.status(500).json({
    success: false,
    message:
      env.NODE_ENV === 'production'
        ? 'Internal server error'
        : String((err as Error)?.message ?? err),
  });
};