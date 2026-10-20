import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import passport from 'passport';
import mongoose from 'mongoose';
import { env } from './config/env';
import { configurePassport } from './config/passport';
import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from './config/session';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { authRoutes } from './routes/auth.routes';
import { publicRoutes } from './routes/public.routes';
import { adminRoutes } from './routes/admin.routes';
import { internalRoutes, uploadRoutes } from './routes/upload.routes';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  const origins = env.CLIENT_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length) {
    app.use(
      cors({
        origin: origins,
        credentials: true,
      }),
    );
  }

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  app.use((request: Request, response: Response, next: NextFunction) => {
    const startedAt = Date.now();
    response.on('finish', () => {
      console.info(
        `${request.method} ${request.path} ${response.statusCode} ${Date.now() - startedAt}ms`,
      );
    });
    next();
  });

  const sessionStore = MongoStore.create({
    client: mongoose.connection.getClient(),
    dbName: mongoose.connection.name,
    collectionName: 'admin_sessions',
    ttl: SESSION_TTL_SECONDS,
    autoRemove: 'native',
  });

  app.use(
    session({
      name: SESSION_COOKIE_NAME,
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      store: sessionStore,
      cookie: {
        httpOnly: true,
        secure: env.COOKIE_SECURE,
        sameSite: env.COOKIE_SAME_SITE,
        maxAge: SESSION_TTL_SECONDS * 1000,
        path: '/',
      },
    }),
  );

  configurePassport();
  app.use(passport.initialize());
  app.use(passport.session());

  app.get('/api/health', (_request, response) => {
    const databaseReady = mongoose.connection.readyState === 1;
    response.status(databaseReady ? 200 : 503).json({
      status: databaseReady ? 'ok' : 'degraded',
      database: databaseReady ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/public', publicRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/uploads', uploadRoutes);
  app.use('/api/internal', internalRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
