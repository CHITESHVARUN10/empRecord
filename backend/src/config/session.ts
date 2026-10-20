import { env } from './env';

export const SESSION_COOKIE_NAME = 'bpi.sid';
export const SESSION_TTL_SECONDS = Math.round(env.SESSION_HOURS * 60 * 60);
