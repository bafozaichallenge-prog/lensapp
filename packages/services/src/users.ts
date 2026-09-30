import type { Audience } from '@prisma/client';
import type { Role } from '@lens/core';
import { audit } from './audit';
import { badRequest, forbidden, notFound, type Actor, type Ctx } from './context';
import { requireRole } from './access';

const parseList = (v?: string) => (v ?? '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);

/**
 * Called after a successful GitLab OIDC login. New users are Viewers. Admin only comes from explicit configuration
 * (LENS_BOOTSTRAP_ADMINS), never from "first person to sign in" (plan §7.2).
 */
export async function upsertOAuthUser(ctx: Ctx, p: { email: string; name?: string | null; gitlabUserId?: string | null }) {
  const email = p.email.trim().toLowerCase();
  if (!email) throw badRequest('Email is required');
  const bootstrap = parseList(ctx.env.LENS_BOOTSTRAP_ADMINS).includes(email);
  const existing = await ctx.db.user.findUnique({ where: { email } });
  const user = existing
    ? await ctx.db.user.update({ where: { id: existing.id }, data: { name: p.name ?? existing.name, gitlabUserId: p.gitlabUserId ?? existing.gitlabUserId, lastSeenAt: ctx.now(), ...(bootstrap && existing.role !== 'ADMIN' ? { role: 'ADMIN' } : {}) } })
    : await ctx.db.user.create({ data: { email, name: p.name ?? null, gitlabUserId: p.gitlabUserId ?? null, role: bootstrap ? 'ADMIN' : 'VIEWER', lastSeenAt: ctx.now() } });
  if (bootstrap && existing?.role !== 'ADMIN') await audit(ctx, user.id, 'user.role_change', { type: 'user', id: user.id }, { from: existing?.role ?? null, to: 'ADMIN', via: 'bootstrap' });
  await audit(ctx, user.id, 'auth.signin', { type: 'user', id: user.id });
  return user;
}

/** Admin-only role change. The last remaining Admin cannot be demoted. */
export async function setRole(ctx: Ctx, actor: Actor, userId: string, role: Role) {
  requireRole(actor, 'user.manage');
  const target = await ctx.db.user.findUnique({ where: { id: userId } });
  if (!target) throw notFound('User not found.');
  if (target.role === 'ADMIN' && role !== 'ADMIN' && (await ctx.db.user.count({ where: { role: 'ADMIN' } })) <= 1) throw badRequest('Lens needs at least one Admin.');
  const u = await ctx.db.user.update({ where: { id: userId }, data: { role } });
  await audit(ctx, actor.id, 'user.role_change', { type: 'user', id: userId }, { from: target.role, to: role });
  return u;
}

/** Audience and theme preferences are per user and are not permissions. */
export async function setPreferences(ctx: Ctx, actor: Actor, prefs: { audience?: Audience; theme?: 'light' | 'dark' }) {
  if (prefs.theme && !['light', 'dark'].includes(prefs.theme)) throw badRequest('Unknown theme');
  const u = await ctx.db.user.update({ where: { id: actor.id }, data: { audiencePref: prefs.audience, themePref: prefs.theme } });
  await audit(ctx, actor.id, 'user.prefs', { type: 'user', id: actor.id }, { audience: prefs.audience, theme: prefs.theme });
  return u;
}

export async function listUsers(ctx: Ctx, actor: Actor) {
  requireRole(actor, 'user.manage');
  return ctx.db.user.findMany({ orderBy: { email: 'asc' }, select: { id: true, email: true, name: true, role: true, lastSeenAt: true } });
}

/** Development seed only: the seeded user is Admin. Refuses to run in production. */
export async function seedDevAdmin(ctx: Ctx, email = 'admin@lens.local') {
  if (ctx.env.NODE_ENV === 'production') throw forbidden('Development seed is disabled in production.');
  return ctx.db.user.upsert({ where: { email }, create: { email, name: 'Dev Admin', role: 'ADMIN' }, update: { role: 'ADMIN' } });
}
