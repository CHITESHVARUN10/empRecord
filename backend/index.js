import 'dotenv/config';
import express from 'express';
import { createServer } from 'node:http';
import { env } from './src/config/env.js';
import { connectDb, disconnectDb } from './src/config/db.js';
import { seedAdminOnStart } from './src/services/admin-seed.service.js';
import { cleanupUploadSessions } from './src/services/upload-session.service.js';
import { createApp } from './src/create-app.js';

const isVercel = Boolean(process.env.VERCEL);

await connectDb(env.MONGODB_URI);

if (env.SEED_ADMIN_ON_START) {
  await seedAdminOnStart();
}

const app = express();
createApp(express, app);

export default app;

if (!isVercel) {
  void cleanupUploadSessions(50).catch((error) => {
    console.warn(
      'Upload session cleanup failed:',
      error instanceof Error ? error.message : error,
    );
  });

  const cleanupTimer = setInterval(() => {
    void cleanupUploadSessions(50).catch((error) => {
      console.warn(
        'Upload session cleanup failed:',
        error instanceof Error ? error.message : error,
      );
    });
  }, 60 * 60 * 1000);
  cleanupTimer.unref();

  const server = createServer(app);

  server.listen(env.PORT, () => {
    console.info(
      `API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`,
    );
  });

  let shuttingDown = false;

  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(cleanupTimer);
    console.info(`${signal} received. Shutting down.`);

    const forceExit = setTimeout(() => {
      console.error('Shutdown timed out.');
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    server.close(async () => {
      try {
        await disconnectDb();
        process.exit(0);
      } catch (error) {
        console.error(
          'Shutdown failed:',
          error instanceof Error ? error.message : error,
        );
        process.exit(1);
      }
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}
