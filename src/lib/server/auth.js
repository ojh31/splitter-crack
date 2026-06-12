import crypto from 'node:crypto';
import { env } from '$env/dynamic/private';

const SECRET = env.AUTH_SECRET || 'dev-insecure-secret';
export const SESSION_COOKIE = 'splitter_session';

/** Random URL-safe token for invite / login links. */
export function newToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function sign(value) {
  return crypto.createHmac('sha256', SECRET).update(value).digest('base64url');
}

/** Returns a signed cookie value of the form "<userId>.<sig>". */
export function makeSession(userId) {
  return `${userId}.${sign(userId)}`;
}

/** Verify a signed cookie value; returns userId or null. */
export function readSession(cookieValue) {
  if (!cookieValue) return null;
  const idx = cookieValue.lastIndexOf('.');
  if (idx < 0) return null;
  const userId = cookieValue.slice(0, idx);
  const sig = cookieValue.slice(idx + 1);
  const expected = sign(userId);
  // Constant-time compare to avoid leaking signature via timing.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return userId;
}

export const cookieOptions = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax',
  // Secure only in production so http://localhost dev still works.
  secure: env.NODE_ENV === 'production',
  maxAge: 60 * 60 * 24 * 365 // 1 year — these are low-stakes household sessions
};
