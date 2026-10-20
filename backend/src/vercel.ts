import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from './app';
import { ensureDb } from './config/db';
import { env } from './config/env';
import { seedAdminOnStart } from './services/admin-seed.service';

let app: ReturnType<typeof createApp> | null = null;
let initPromise: Promise<void> | null = null;

function init(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      await ensureDb();
      if (env.SEED_ADMIN_ON_START) {
        await seedAdminOnStart();
      }
      app = createApp();
    })().catch((error) => {
      initPromise = null;
      throw error;
    });
  }
  return initPromise;
}

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  await init();

  if (!app) {
    throw new Error('The API application did not initialize.');
  }

  const url = request.url ?? '/';
  if (!url.startsWith('/api')) {
    request.url = `/api${url.startsWith('/') ? '' : '/'}${url}`;
  }

  app(request, response);
}
