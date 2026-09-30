/**
 * Stable entity refs (review item 2). A ref identifies an entity by natural key,
 * so it stays meaningful across snapshots; resolve it against a snapshot id.
 */
export type RefKind = 'file' | 'sym' | 'req' | 'rule' | 'table' | 'proc' | 'step' | 'ticket' | 'incident' | 'commit';

const KINDS: RefKind[] = ['file', 'sym', 'req', 'rule', 'table', 'proc', 'step', 'ticket', 'incident', 'commit'];

export const ref = (kind: RefKind, key: string): string => `${kind}:${key}`;
export const fileRef = (path: string) => ref('file', path);
export const symRef = (fqn: string) => ref('sym', fqn);
export const reqRef = (code: string) => ref('req', code.toUpperCase());
export const ruleRef = (code: string) => ref('rule', code.toUpperCase());
export const tableRef = (name: string) => ref('table', name.toLowerCase());

export function parseRef(r: string): { kind: RefKind; key: string } | null {
  const i = r.indexOf(':');
  if (i < 0) return null;
  const kind = r.slice(0, i) as RefKind;
  const key = r.slice(i + 1);
  if (!KINDS.includes(kind) || !key) return null;
  return { kind, key };
}
