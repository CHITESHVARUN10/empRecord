import bcrypt from "bcryptjs";
import { env } from "../config/env.js";
import { AdminModel } from "../models/Admin.js";
async function seedAdmin(options = {}) {
  const username = (options.username ?? env.ADMIN_USERNAME).trim().toLowerCase();
  const password = options.password ?? env.ADMIN_PASSWORD;
  const displayName = options.displayName ?? env.ADMIN_DISPLAY_NAME ?? "HR Administrator";
  const force = options.force ?? false;
  if (!username) {
    throw new Error("ADMIN_USERNAME is required to seed an administrator.");
  }
  if (!password) {
    throw new Error(
      "ADMIN_PASSWORD is required to seed an administrator. Add it to backend/.env and run npm run seed:admin."
    );
  }
  const existing = await AdminModel.findOne({ username }).select("+passwordHash");
  if (existing) {
    let changed = false;
    if (force) {
      existing.passwordHash = await bcrypt.hash(password, 12);
      changed = true;
    }
    if (existing.displayName !== displayName) {
      existing.displayName = displayName;
      changed = true;
    }
    if (changed) {
      await existing.save();
      return "updated";
    }
    return "exists";
  }
  await AdminModel.create({
    username,
    passwordHash: await bcrypt.hash(password, 12),
    displayName
  });
  return "created";
}
async function seedAdminOnStart() {
  if (!env.SEED_ADMIN_ON_START) return;
  if (!env.ADMIN_PASSWORD) {
    console.warn(
      "SEED_ADMIN_ON_START is enabled but ADMIN_PASSWORD is empty. Skipping admin seed."
    );
    return;
  }
  try {
    const result = await seedAdmin();
    console.info(`Admin seed on start: ${result}`);
  } catch (error) {
    console.error(
      "Admin seed on start failed:",
      error instanceof Error ? error.message : error
    );
  }
}
export {
  seedAdmin,
  seedAdminOnStart
};
