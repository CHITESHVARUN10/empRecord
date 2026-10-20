import { env } from "./env.js";
const SESSION_COOKIE_NAME = "bpi.sid";
const SESSION_TTL_SECONDS = Math.round(env.SESSION_HOURS * 60 * 60);
export {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS
};
