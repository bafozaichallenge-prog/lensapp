import type { CommitInput, GraphInput } from '@lens/core';
import { commonPrefix, purposeOf } from '@lens/ingest';
import type { GraphView } from '@lens/impact';

export interface TicketInfo { key: string; taskmanager: string; title: string; note: string; commit: string | null; reqs: string[] }
export interface IncidentInfo { key: string; severity: string; status: string; title: string; rootCause: string; files: string[]; reqs: string[]; fixTicket: string | null; residual: string }

/** Everything the AI layer may consult, bound to one graph snapshot. Paths shown to the model are prefix-stripped, as in the prototype. */
export interface RepoIndex {
  sourceName: string;
  vertical: string;
  graph: GraphInput;
  view: GraphView;
  texts: Map<string, string>;   // repo path -> decoded text
  commits: CommitInput[];
  tickets: TicketInfo[];
  incidents: IncidentInfo[];
  prefix: string;
  strip(p: string): string;
  /** Resolve a model-supplied path (stripped or full) to a repo path, or undefined. */
  resolve(p: string): string | undefined;
}

export function buildRepoIndex(o: Omit<RepoIndex, 'prefix' | 'strip' | 'resolve' | 'texts'> & { files: { path: string; text: string }[] }): RepoIndex {
  const texts = new Map(o.files.map((f) => [f.path, f.text]));
  const prefix = commonPrefix(o.files.map((f) => f.path));
  const strip = (p: string) => (prefix && p.startsWith(prefix) ? p.slice(prefix.length) : p);
  const resolve = (p: string) => {
    const q = String(p ?? '').trim();
    if (texts.has(q)) return q;
    if (texts.has(prefix + q)) return prefix + q;
    return undefined;
  };
  return { ...o, texts, prefix, strip, resolve };
}

export const filePurpose = (i: RepoIndex, path: string) => purposeOf(i.graph.files.find((f) => f.path === path)?.header);
