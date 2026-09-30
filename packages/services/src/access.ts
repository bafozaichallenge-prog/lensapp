import type { Source } from '@prisma/client';
import { can, type Action } from '@lens/core';
import { forbidden, notFound, VISIBILITY_TTL_MS, type Actor, type Ctx } from './context';

/**
 * Two-dimensional access (plan §7.4): Lens role AND GitLab visibility. GitLab answers are cached per user/source
 * for a short TTL. Break-glass admins have no GitLab account and are trusted for source visibility.
 */
export async function canSeeSource(ctx: Ctx, actor: Actor, source: Pick<Source, 'id' | 'gitlabProjectId'>): Promise<boolean> {
  if (actor.breakGlass && actor.role === 'ADMIN') return true;
  const cached = await ctx.db.sourceVisibility.findUnique({ where: { userId_sourceId: { userId: actor.id, sourceId: source.id } } });
  if (cached && ctx.now().getTime() - cached.checkedAt.getTime() < VISIBILITY_TTL_MS) return cached.canRead;
  let ok = false;
  try { ok = await ctx.visibility.canRead(actor.id, source.gitlabProjectId); } catch { ok = false; } // fail closed
  await ctx.db.sourceVisibility.upsert({
    where: { userId_sourceId: { userId: actor.id, sourceId: source.id } },
    create: { userId: actor.id, sourceId: source.id, canRead: ok, checkedAt: ctx.now() },
    update: { canRead: ok, checkedAt: ctx.now() },
  });
  return ok;
}

/** Load a source and enforce the action. Sources the user cannot see look like they do not exist. */
export async function requireSource(ctx: Ctx, actor: Actor, action: Action, sourceId: string): Promise<Source> {
  const source = await ctx.db.source.findUnique({ where: { id: sourceId } });
  if (!source) throw notFound('Source not found.');
  const visible = await canSeeSource(ctx, actor, source);
  if (!visible) throw notFound('Source not found.');
  if (!can(action, { role: actor.role, canSeeSource: visible })) throw forbidden();
  return source;
}

/** Sources the actor may see (Lens role grants read to everyone signed in; GitLab decides the rest). */
export async function visibleSources(ctx: Ctx, actor: Actor): Promise<Source[]> {
  const all = await ctx.db.source.findMany({ orderBy: [{ vertical: 'asc' }, { name: 'asc' }] });
  const flags = await Promise.all(all.map((s) => canSeeSource(ctx, actor, s)));
  return all.filter((_, i) => flags[i]);
}

export function requireRole(actor: Actor, action: Action): void {
  if (!can(action, { role: actor.role, canSeeSource: true })) throw forbidden();
}

/** Drop credentials before anything leaves the server layer. */
export function publicSource(s: Source) {
  const { tokenEnc, ...rest } = s;
  return { ...rest, hasToken: !!tokenEnc };
}
export type PublicSource = ReturnType<typeof publicSource>;
