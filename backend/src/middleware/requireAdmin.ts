import type { NextFunction, Request, Response } from 'express';

export function requireAdmin(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  if (request.isAuthenticated && request.isAuthenticated()) {
    next();
    return;
  }

  response.status(401).json({
    error: {
      code: 'UNAUTHORIZED',
      message: 'Sign in to continue.',
    },
  });
}
