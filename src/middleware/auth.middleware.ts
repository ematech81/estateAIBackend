import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';
import { User, UserRole } from '../models/User';

export interface AuthTokenPayload {
  sub: string; // user id
  role: UserRole;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Missing or malformed Authorization header');
  }

  const token = header.slice('Bearer '.length);
  let payload: AuthTokenPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;
  } catch {
    throw ApiError.unauthorized('Invalid or expired token');
  }

  // A JWT stays valid until it expires, so a suspension has to be checked
  // against the database — otherwise a suspended account would keep working
  // for up to a week. One indexed lookup per authenticated request.
  User.exists({ _id: payload.sub, suspended: true })
    .then((suspended) => {
      if (suspended) {
        next(ApiError.forbidden('Your account has been suspended. Contact EstateAI support.'));
        return;
      }
      req.user = payload;
      next();
    })
    .catch(next);
}

// Always used after requireAuth (which populates req.user from the JWT) —
// checks the role already on the token rather than re-querying the user.
// There's no self-serve way to become an admin; role is only ever set via
// scripts/promoteToAdmin.ts.
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    throw ApiError.unauthorized();
  }
  if (req.user.role !== 'admin') {
    throw ApiError.forbidden('Admin access required');
  }
  next();
}

// For public routes that behave slightly differently for a logged-in agent
// (e.g. not counting their own views). A missing or bad token is simply
// treated as "anonymous visitor" — never an error.
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(header.slice('Bearer '.length), env.JWT_SECRET) as AuthTokenPayload;
    } catch {
      // ignore — treat as anonymous
    }
  }
  next();
}
