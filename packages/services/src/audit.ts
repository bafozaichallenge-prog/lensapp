import type { Prisma } from '@prisma/client';
import type { Ctx } from './context';

export type AuditAction =
  | 'auth.signin' | 'auth.signout' | 'user.role_change' | 'user.prefs'
  | 'source.create' | 'source.update' | 'source.credential_change' | 'source.delete'
  | 'sync.queued' | 'sync.done' | 'sync.failed' | 'import.run'
  | 'process.create' | 'process.update' | 'process.remove'
  | 'project.create' | 'analysis.run' | 'analysis.done' | 'analysis.failed' | 'pack.refine';

/** Audit trail (plan §13). `detail` must never contain secrets or prompt contents. */
export async function audit(ctx: Ctx, userId: string | null, action: AuditAction, target?: { type: string; id: string }, detail?: Record<string, unknown>) {
  await ctx.db.auditLog.create({ data: { userId, action, targetType: target?.type, targetId: target?.id, detailJson: (detail ?? undefined) as Prisma.InputJsonValue | undefined } });
}
