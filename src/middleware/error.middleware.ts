import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'ValidationError',
      message: 'Request failed validation',
      details: err.flatten(),
    });
    return;
  }

  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      error: err.name,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  // Always a generic message to the client, in every environment — an
  // unhandled error here is by definition something we didn't anticipate
  // (a dropped DB connection, an unexpected exception, ...), and its raw
  // text can contain internal details (hostnames, stack fragments, driver
  // internals) that have no business reaching a browser. This used to be
  // raw in development "for convenience," which is exactly how a user's
  // flaky wifi turned into a MongoServerSelectionError being displayed on
  // the login page. The full error still goes to the server console below
  // — that's where a developer should actually be looking, not the UI.
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'InternalServerError',
    message: 'Something went wrong on our end. Please try again in a moment.',
  });
}
