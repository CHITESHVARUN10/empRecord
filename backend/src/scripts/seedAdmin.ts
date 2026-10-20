import { env } from '../config/env';
import { connectDb, disconnectDb } from '../config/db';
import { seedAdmin } from '../services/admin-seed.service';

async function main(): Promise<void> {
  const force = process.argv.includes('--force');

  if (!env.ADMIN_PASSWORD) {
    console.error(
      'ADMIN_PASSWORD is empty. Add it to backend/.env and run this command again.',
    );
    process.exitCode = 1;
    return;
  }

  await connectDb(env.MONGODB_URI);
  try {
    const result = await seedAdmin({ force });
    console.info(
      result === 'created'
        ? `Admin "${env.ADMIN_USERNAME}" created.`
        : result === 'updated'
          ? `Admin "${env.ADMIN_USERNAME}" updated.`
          : `Admin "${env.ADMIN_USERNAME}" already exists. Use --force to reset the password.`,
    );
  } finally {
    await disconnectDb();
  }
}

main().catch(async (error) => {
  console.error(
    'Admin seed failed:',
    error instanceof Error ? error.message : error,
  );
  await disconnectDb().catch(() => undefined);
  process.exit(1);
});
