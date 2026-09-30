import { buildSpec, type SpecOptions } from './spec';
import type { PGraph } from './graph';

/** Spec cache keyed by process + graph snapshot SHA (plan §19); a new snapshot regenerates the spec. */
export class SpecCache {
  private m = new Map<string, unknown>();
  get(g: PGraph, pi: number, sha: string, opt: SpecOptions, refinedKey = ''): any {
    const key = `${sha}|${g.processes[pi]!.name}|${refinedKey}`;
    if (!this.m.has(key)) this.m.set(key, buildSpec(g, pi, opt));
    return this.m.get(key);
  }
  get size() { return this.m.size; }
  clear() { this.m.clear(); }
}
