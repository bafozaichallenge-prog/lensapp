import { describe, expect, it } from 'vitest';
import { chunkAbl, extractRefs, stripComments } from '../src/abl.js';
import { HashingEmbedder } from '../src/embed.js';
import { collectChunks } from '../src/indexer.js';
import { Index } from '../src/store.js';
import { findReferences, listSymbols, readSource } from '../src/tools.js';

const e = new HashingEmbedder();
const build = async () => Index.build((await collectChunks('sample-abl')).chunks, e);

describe('chunker', () => {
  it('splits on procedures and functions', () => {
    const src = 'PROCEDURE a:\n  x = 1.\nEND PROCEDURE.\nFUNCTION f RETURNS LOGICAL ():\n  RETURN TRUE.\nEND FUNCTION.';
    const c = chunkAbl('t.p', src);
    expect(c.map((x) => [x.kind, x.name])).toEqual([['procedure', 'a'], ['function', 'f']]);
  });
  it('ignores nested comments', () => {
    expect(stripComments('a /* b /* c */ d */ e // f\ng')).not.toMatch(/[bcdf]/);
    expect(extractRefs('/* RUN hidden.p */ RUN real.p.').runs).toEqual(['real.p']);
  });
  it('extracts tables and includes', () => {
    const r = extractRefs('{inc/x.i}\nFOR EACH Customer NO-LOCK: END. FIND FIRST Order WHERE TRUE.');
    expect(r.tables).toEqual(expect.arrayContaining(['Customer', 'Order']));
    expect(r.includes).toEqual(['inc/x.i']);
  });
});

describe('index + tools', () => {
  it('finds the right procedure by intent', async () => {
    const hits = await (await build()).search('credit limit check for customer balance', e, 3);
    expect(hits[0].chunk.name).toBe('checkCreditLimit');
  });
  it('finds table and RUN references', async () => {
    const ix = await build();
    expect(findReferences(ix, 'table', 'OrderLine')).toContain('calcOrderTotal');
    expect(findReferences(ix, 'run', 'audit-log.p')).toContain('checkCreditLimit');
    expect(listSymbols(ix, 'src/order-totals.p')).toContain('isLargeOrder');
  });
  it('refuses path traversal', async () => {
    await expect(readSource('sample-abl', '../package.json')).rejects.toThrow(/outside/);
    expect(await readSource('sample-abl', 'src/audit-log.p', 1, 2)).toContain('1: /* audit-log.p');
  });
  it('rejects a mismatched embedder', async () => {
    await expect((await build()).search('x', new HashingEmbedder(64))).rejects.toThrow(/Re-run/);
  });
});
