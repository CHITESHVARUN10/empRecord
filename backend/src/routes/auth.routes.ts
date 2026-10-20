import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import passport from 'passport';
import { z } from 'zod';
import { AdminModel } from '../models/Admin';
import { requireAdmin } from '../middleware/requireAdmin';
import { SESSION_COOKIE_NAME } from '../config/session';
import { HttpError } from '../utils/http-error';
import { serializeAdmin } from '../utils/serialize';

const loginSchema = z
  .object({
    username: z.string().trim().min(1).max(80),
    password: z.string().min(1).max(200),
  })
  .strict();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (_request, response) => {
    response.status(429).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Too many sign-in attempts. Try again in a few minutes.',
      },
    });
  },
});

export const authRoutes = Router();

authRoutes.post('/login', loginLimiter, (request, response, next) => {
  const result = loginSchema.safeParse(request.body);
  if (!result.success) {
    response.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Enter your username and password.',
      },
    });
    return;
  }

  passport.authenticate(
    'local',
    (
      error: unknown,
      admin: Express.User | false,
      info: { message?: string } | undefined,
    ) => {
      if (error) {
        next(error);
        return;
      }

      if (!admin) {
        response.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: info?.message ?? 'Invalid username or password.',
          },
        });
        return;
      }

      request.session.regenerate((regenerateError) => {
        if (regenerateError) {
          next(regenerateError);
          return;
        }

        request.login(admin, (loginError) => {
          if (loginError) {
            next(loginError);
            return;
          }

          request.session.save((saveError) => {
            if (saveError) {
              next(saveError);
              return;
            }

            void AdminModel.updateOne(
              { _id: admin._id },
              { $set: { lastLoginAt: new Date() } },
            ).catch(() => undefined);

            response.json({ admin: serializeAdmin(admin) });
          });
        });
      });
    },
  )(request, response, next);
});

authRoutes.get('/me', requireAdmin, (request, response) => {
  if (!request.user) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Sign in to continue.');
  }
  response.json({ admin: serializeAdmin(request.user) });
});

authRoutes.post('/logout', (request, response, next) => {
  request.logout((logoutError) => {
    if (logoutError) {
      next(logoutError);
      return;
    }

    request.session.destroy((destroyError) => {
      if (destroyError) {
        next(destroyError);
        return;
      }

      response.clearCookie(SESSION_COOKIE_NAME);
      response.status(204).send();
    });
  });
});
