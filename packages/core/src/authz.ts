import type { Role } from './types';

export type Action =
  | 'source.view' | 'source.sync' | 'source.manage'
  | 'import.run' | 'import.allowPersonalData'
  | 'process.manage'
  | 'project.create' | 'project.analyse' | 'pack.refine' | 'download'
  | 'user.manage' | 'settings.manage';

const RANK: Record<Role, number> = { VIEWER: 0, CONTRIBUTOR: 1, MAINTAINER: 2, ADMIN: 3 };

const MIN_ROLE: Record<Action, Role> = {
  'source.view': 'VIEWER',
  'download': 'VIEWER',
  'project.create': 'CONTRIBUTOR',
  'project.analyse': 'CONTRIBUTOR',
  'pack.refine': 'CONTRIBUTOR',
  'source.sync': 'MAINTAINER',
  'import.run': 'MAINTAINER',
  'process.manage': 'MAINTAINER',
  'source.manage': 'MAINTAINER',
  'import.allowPersonalData': 'ADMIN',
  'user.manage': 'ADMIN',
  'settings.manage': 'ADMIN',
};

/** Actions that additionally require the user to see the source in GitLab (plan §7.4). */
const NEEDS_SOURCE_VISIBILITY = new Set<Action>([
  'source.view', 'source.sync', 'source.manage', 'import.run', 'process.manage',
  'project.create', 'project.analyse', 'pack.refine', 'download',
]);

export interface AuthzContext {
  role: Role | null | undefined;
  /** Lens access granted AND GitLab account can read the source. Undefined = not applicable/unknown => denied where needed. */
  canSeeSource?: boolean;
}

/** Server-side decision. Both dimensions must pass; unknown/absent role is denied. */
export function can(action: Action, ctx: AuthzContext): boolean {
  if (!ctx.role) return false;
  if (RANK[ctx.role] < RANK[MIN_ROLE[action]]) return false;
  if (NEEDS_SOURCE_VISIBILITY.has(action) && ctx.canSeeSource !== true) return false;
  return true;
}

export const ACTIONS = Object.keys(MIN_ROLE) as Action[];
export const minRole = (a: Action): Role => MIN_ROLE[a];
