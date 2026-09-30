/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'node:fs';
import path from 'node:path';

/** The prototype's worked example ("Last-day debit order collections") converted to the v2 analysis shape. */
export function asV2Example(): any {
  const e = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../fixtures/example-last-day-debit-orders.json'), 'utf8'));
  const out = structuredClone(e);
  delete out.request;
  out.processes = [{ process: 'New Business Process', stages: out.stages ?? [], new_stages: out.new_stages ?? [] }];
  delete out.stages; delete out.new_stages;
  return out;
}
export const exampleRequest = (): string => JSON.parse(fs.readFileSync(path.resolve(__dirname, '../fixtures/example-last-day-debit-orders.json'), 'utf8')).request;
