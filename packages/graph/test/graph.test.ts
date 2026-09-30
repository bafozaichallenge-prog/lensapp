import { describe, it, expect } from 'vitest';
import type { GraphInput } from '@lens/core';
import { SnapshotStore, validateGraph, hasErrors, diffFacts, formatDiff, isEmptyDiff } from '../src';

const empty = (): GraphInput => ({ files: [], symbols: [], edges: [], tables: [], requirements: [], ruleCodes: [], processes: [], metrics: [], warnings: [] });
const graph = (n: number): GraphInput => ({ ...empty(), files: Array.from({ length: n }, (_, i) => ({ path: `f${i}.cls`, kind: 'class' as const, loc: 1, isTest: false })) });

describe('snapshot lifecycle', () => {
  it('activates a valid snapshot and supersedes the previous one atomically', () => {
    const s = new SnapshotStore();
    const a = s.begin('src', 'sha1'); s.commit(a.id, graph(20));
    const b = s.begin('src', 'sha2'); s.commit(b.id, graph(21));
    expect(s.active('src')!.id).toBe(b.id);
    expect(s.get(a.id)!.status).toBe('SUPERSEDED');
    expect(s.all('src').filter((x) => x.status === 'ACTIVE')).toHaveLength(1);
  });
  it('a failed sync never replaces the active snapshot', () => {
    const s = new SnapshotStore();
    const a = s.begin('src', 'sha1'); s.commit(a.id, graph(20));
    const b = s.begin('src', 'sha2'); s.fail(b.id, 'GitLab 500');
    expect(s.active('src')!.id).toBe(a.id);
    const c = s.begin('src', 'sha3'); s.commit(c.id, graph(2)); // collapse >50%
    expect(s.get(c.id)!.status).toBe('FAILED');
    expect(s.active('src')!.id).toBe(a.id);
  });
  it('an empty graph or dangling edge is rejected', () => {
    expect(hasErrors(validateGraph(empty()))).toBe(true);
    const g = graph(1); g.edges.push({ from: 'file:f0.cls', to: 'file:nope.cls', type: 'uses', origin: 'EXPLICIT', confidence: 1 });
    expect(validateGraph(g).some((i) => i.message.includes('Dangling'))).toBe(true);
  });
  it('an unchanged head SHA is recognised so no new state is needed', () => {
    const s = new SnapshotStore();
    const a = s.begin('src', 'sha1'); s.commit(a.id, graph(3));
    expect(s.isCurrent('src', 'sha1')).toBe(true);
    expect(s.isCurrent('src', 'sha2')).toBe(false);
  });
  it('cannot commit twice', () => {
    const s = new SnapshotStore();
    const a = s.begin('src', 'x'); s.commit(a.id, graph(3));
    expect(() => s.commit(a.id, graph(3))).toThrow();
  });
});

describe('fact diff', () => {
  it('reports exactly which facts appeared and vanished', () => {
    const d = diffFacts(['a', 'b', 'c'], ['b', 'c', 'd']);
    expect(d).toEqual({ missing: ['a'], unexpected: ['d'] });
    expect(formatDiff(d)).toContain('- a');
    expect(formatDiff(d)).toContain('+ d');
    expect(isEmptyDiff(diffFacts(['a'], ['a']))).toBe(true);
  });
});
