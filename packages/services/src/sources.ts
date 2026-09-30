import { encrypt } from '@lens/core';
import { audit } from './audit';
import { badRequest, forbidden, type Actor, type Ctx } from './context';
import { publicSource, requireRole, requireSource, visibleSources } from './access';

export interface SourceInput {
  gitlabProjectId: number; pathWithNamespace: string; branch: string; vertical: string; name: string;
  pathFilters?: string[]; commitRefPattern?: string; token?: string;
}

function validateRegex(p: string) { try { new RegExp(p); } catch { throw badRequest('Commit reference pattern is not a valid regular expression.'); } }

/** Add a system source (Maintainer+; the actor must also be able to read the GitLab project). */
export async function addSource(ctx: Ctx, actor: Actor, i: SourceInput) {
  requireRole(actor, 'source.manage');
  if (!i.name.trim() || !i.vertical.trim() || !i.branch.trim()) throw badRequest('Name, vertical and branch are required.');
  if (i.commitRefPattern) validateRegex(i.commitRefPattern);
  if (!actor.breakGlass && !(await ctx.visibility.canRead(actor.id, i.gitlabProjectId))) throw forbidden('Your GitLab account cannot read that project.');
  if (i.token && !ctx.keys) throw badRequest('LENS_ENCRYPTION_KEYS is not configured; credentials cannot be stored.');
  const s = await ctx.db.source.create({
    data: {
      name: i.name.trim(), vertical: i.vertical.trim(), gitlabProjectId: i.gitlabProjectId, pathWithNamespace: i.pathWithNamespace, branch: i.branch.trim(),
      pathFilters: i.pathFilters ?? [], ...(i.commitRefPattern ? { commitRefPattern: i.commitRefPattern } : {}),
      tokenEnc: i.token ? encrypt(i.token, ctx.keys!) : null,
    },
  });
  await audit(ctx, actor.id, 'source.create', { type: 'source', id: s.id }, { name: s.name, project: s.pathWithNamespace, hasToken: !!i.token });
  return publicSource(s);
}

/** Replace a source credential. The token is encrypted at rest and never returned. */
export async function setSourceToken(ctx: Ctx, actor: Actor, sourceId: string, token: string | null) {
  await requireSource(ctx, actor, 'source.manage', sourceId);
  if (token && !ctx.keys) throw badRequest('LENS_ENCRYPTION_KEYS is not configured.');
  const s = await ctx.db.source.update({ where: { id: sourceId }, data: { tokenEnc: token ? encrypt(token, ctx.keys!) : null } });
  await audit(ctx, actor.id, 'source.credential_change', { type: 'source', id: sourceId }, { set: !!token });
  return publicSource(s);
}

export async function updateSource(ctx: Ctx, actor: Actor, sourceId: string, patch: Partial<Pick<SourceInput, 'name' | 'vertical' | 'branch' | 'pathFilters' | 'commitRefPattern'>> & { aiAllowed?: boolean }) {
  await requireSource(ctx, actor, 'source.manage', sourceId);
  if (patch.commitRefPattern) validateRegex(patch.commitRefPattern);
  if (patch.aiAllowed !== undefined) requireRole(actor, 'settings.manage'); // sending code to an external model is an Admin decision
  const s = await ctx.db.source.update({ where: { id: sourceId }, data: patch });
  await audit(ctx, actor.id, 'source.update', { type: 'source', id: sourceId }, patch as Record<string, unknown>);
  return publicSource(s);
}

export async function listSources(ctx: Ctx, actor: Actor) {
  const list = await visibleSources(ctx, actor);
  const active = await ctx.db.graphSnapshot.findMany({ where: { sourceId: { in: list.map((s) => s.id) }, status: 'ACTIVE' }, include: { _count: { select: { files: true, symbols: true, edges: true } } } });
  return list.map((s) => {
    const a = active.find((x) => x.sourceId === s.id);
    return { ...publicSource(s), snapshot: a ? { id: a.id, sha: a.sha, activatedAt: a.activatedAt, counts: a._count } : null };
  });
}

export async function getSource(ctx: Ctx, actor: Actor, sourceId: string) {
  return publicSource(await requireSource(ctx, actor, 'source.view', sourceId));
}
