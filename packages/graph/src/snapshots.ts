import type { GraphInput } from '@lens/core';
import { validateGraph, hasErrors, type ValidationIssue } from './validate';

export type SnapshotStatus = 'BUILDING' | 'READY' | 'ACTIVE' | 'SUPERSEDED' | 'FAILED';

export interface Snapshot {
  id: number;
  sourceId: string;
  sha: string;
  status: SnapshotStatus;
  createdAt: Date;
  activatedAt?: Date;
  graph?: GraphInput;
  issues: ValidationIssue[];
}

/**
 * Reference implementation of the snapshot lifecycle (plan §9): build -> validate -> atomically activate.
 * The Prisma-backed store performs the same transitions inside one transaction. A failed sync never
 * replaces the active snapshot, and only one snapshot per source is ACTIVE at a time.
 */
export class SnapshotStore {
  private snaps: Snapshot[] = [];
  private seq = 0;

  begin(sourceId: string, sha: string): Snapshot {
    const s: Snapshot = { id: ++this.seq, sourceId, sha, status: 'BUILDING', createdAt: new Date(), issues: [] };
    this.snaps.push(s);
    return s;
  }

  active(sourceId: string): Snapshot | undefined {
    return this.snaps.find((s) => s.sourceId === sourceId && s.status === 'ACTIVE');
  }

  get(id: number) { return this.snaps.find((s) => s.id === id); }
  all(sourceId: string) { return this.snaps.filter((s) => s.sourceId === sourceId); }

  /** Attach a graph, validate, and activate atomically. On any error the previous snapshot stays active. */
  commit(id: number, graph: GraphInput): Snapshot {
    const s = this.get(id);
    if (!s || s.status !== 'BUILDING') throw new Error(`Snapshot ${id} is not building`);
    const prev = this.active(s.sourceId);
    s.issues = validateGraph(graph, prev?.graph ? { files: prev.graph.files.length } : undefined);
    if (hasErrors(s.issues)) { s.status = 'FAILED'; return s; }
    s.graph = graph;
    // atomic swap: no interleaving state where two (or zero) snapshots are ACTIVE
    if (prev) prev.status = 'SUPERSEDED';
    s.status = 'ACTIVE';
    s.activatedAt = new Date();
    return s;
  }

  fail(id: number, message: string) {
    const s = this.get(id);
    if (s && s.status === 'BUILDING') { s.status = 'FAILED'; s.issues.push({ level: 'error', message }); }
  }

  /** True when the head SHA is already the active snapshot, so an unchanged sync creates no new state. */
  isCurrent(sourceId: string, sha: string) { return this.active(sourceId)?.sha === sha; }
}
