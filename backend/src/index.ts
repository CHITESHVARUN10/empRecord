import { createServer } from 'node:http';
import { env } from './config/env';
import { connectDb, disconnectDb } from './config/db';
import { seedAdminOnStart } from './services/admin-seed.service';
import { cleanupUploadSessions } from './services/upload-session.service';
import { createApp } from './app';

async function start(): Promise<void> {
  await connectDb(env.MONGODB_URI);
  await seedAdminOnStart();

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

  const app = createApp();
  const server = createServer(app);

  server.listen(env.PORT, () => {
    console.info(
      `API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`,
    );
  });

  let shuttingDown = false;

  const shutdown = async (signal: string) => {
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

start().catch((error) => {
  console.error(
    'Failed to start API:',
    error instanceof Error ? error.stack ?? error.message : error,
  );
  process.exit(1);
});
