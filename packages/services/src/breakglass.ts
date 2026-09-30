import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { audit } from './audit';
import type { Ctx } from './context';

export const BREAK_GLASS_EMAIL = 'breakglass@lens.local';
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

/** scrypt$<saltHex>$<hashHex>. Used for the optional local Admin (plan §7.1); produce with `npm run break-glass:hash`. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${scryptSync(password, salt, 32).toString('hex')}`;
}
export function verifyPassword(password: string, stored: string): boolean {
  const [alg, saltHex, hashHex] = stored.split('$');
  if (alg !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const attempts = new Map<string, number[]>();
const WINDOW_MS = 60_000, MAX_ATTEMPTS = 5;
/** Sliding-window limiter per client key (IP). Exposed for tests. */
export function rateLimited(key: string, now = Date.now()): boolean {
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now); attempts.set(key, recent);
  return recent.length > MAX_ATTEMPTS;
}
export const resetRateLimit = () => attempts.clear();

export const breakGlassEnabled = (env: Record<string, string | undefined>) => !!env.LENS_BREAK_GLASS_HASH;

/**
 * Optional break-glass Admin. Disabled unless LENS_BREAK_GLASS_HASH is set. Creates a database session (same shape as an
 * OIDC session) that expires after 8 hours. Every attempt is audited without the password.
 */
export async function breakGlassLogin(ctx: Ctx, password: string, clientKey: string): Promise<{ token: string; expires: Date } | null> {
  const stored = ctx.env.LENS_BREAK_GLASS_HASH;
  if (!stored) return null;
  const limited = rateLimited(clientKey, ctx.now().getTime());
  const ok = !limited && verifyPassword(password, stored);
  if (!ok) { await audit(ctx, null, 'auth.signin', { type: 'break-glass', id: 'local' }, { ok: false, limited }); return null; }
  const user = await ctx.db.user.upsert({ where: { email: BREAK_GLASS_EMAIL }, create: { email: BREAK_GLASS_EMAIL, name: 'Break-glass admin', role: 'ADMIN' }, update: { role: 'ADMIN', lastSeenAt: ctx.now() } });
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(ctx.now().getTime() + SESSION_MAX_AGE_SECONDS * 1000);
  await ctx.db.session.create({ data: { sessionToken: token, userId: user.id, expires } });
  await audit(ctx, user.id, 'auth.signin', { type: 'break-glass', id: 'local' }, { ok: true });
  return { token, expires };
}
