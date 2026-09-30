import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { can, ACTIONS, encrypt, decrypt, keyRingFromEnv, needsRotation, csvCell, parseRef, fileRef, type Role } from '../src';

describe('authorisation matrix', () => {
  const roles: Role[] = ['VIEWER', 'CONTRIBUTOR', 'MAINTAINER', 'ADMIN'];
  it('viewer cannot sync/import/manage processes', () => {
    for (const a of ['source.sync', 'import.run', 'process.manage'] as const)
      expect(can(a, { role: 'VIEWER', canSeeSource: true })).toBe(false);
  });
  it('contributor cannot modify sources or manage users', () => {
    expect(can('source.manage', { role: 'CONTRIBUTOR', canSeeSource: true })).toBe(false);
    expect(can('user.manage', { role: 'CONTRIBUTOR' })).toBe(false);
  });
  it('maintainer can sync/import/process but not manage users', () => {
    for (const a of ['source.sync', 'import.run', 'process.manage'] as const)
      expect(can(a, { role: 'MAINTAINER', canSeeSource: true })).toBe(true);
    expect(can('user.manage', { role: 'MAINTAINER' })).toBe(false);
    expect(can('import.allowPersonalData', { role: 'MAINTAINER', canSeeSource: true })).toBe(false);
  });
  it('admin can do everything when the source is visible', () => {
    for (const a of ACTIONS) expect(can(a, { role: 'ADMIN', canSeeSource: true })).toBe(true);
  });
  it('no GitLab visibility => denied regardless of role (two-dimensional model)', () => {
    for (const r of roles)
      for (const a of ['source.view', 'source.sync', 'project.analyse'] as const) {
        expect(can(a, { role: r, canSeeSource: false })).toBe(false);
        expect(can(a, { role: r })).toBe(false);
      }
  });
  it('missing role is denied', () => {
    for (const a of ACTIONS) expect(can(a, { role: null, canSeeSource: true })).toBe(false);
  });
});

describe('crypto', () => {
  const k = (n: string) => `${n}:${randomBytes(32).toString('base64')}`;
  it('round-trips and is non-deterministic', () => {
    const ring = keyRingFromEnv({ LENS_ENCRYPTION_KEYS: k('a') });
    const c1 = encrypt('glpat-secret', ring), c2 = encrypt('glpat-secret', ring);
    expect(c1).not.toBe(c2);
    expect(c1).not.toContain('glpat');
    expect(decrypt(c1, ring)).toBe('glpat-secret');
  });
  it('detects tampering and supports rotation', () => {
    const old = keyRingFromEnv({ LENS_ENCRYPTION_KEYS: k('a') });
    const blob = encrypt('x', old);
    const parts = blob.split('.'); parts[4] = Buffer.from('zzzz').toString('base64url');
    expect(() => decrypt(parts.join('.'), old)).toThrow();
    const ring = { currentId: 'b', keys: { ...old.keys, b: randomBytes(32) } };
    expect(decrypt(blob, ring)).toBe('x');
    expect(needsRotation(blob, ring)).toBe(true);
  });
  it('rejects bad keys', () => {
    expect(() => keyRingFromEnv({ LENS_ENCRYPTION_KEYS: 'a:c2hvcnQ=' })).toThrow();
    expect(() => keyRingFromEnv({})).toThrow();
  });
});

describe('csv + refs', () => {
  it('neutralises formulas', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('-2+3')).toBe("'-2+3");
    expect(csvCell('a,b')).toBe('"a,b"');
  });
  it('parses refs', () => {
    expect(parseRef(fileRef('src/A.cls'))).toEqual({ kind: 'file', key: 'src/A.cls' });
    expect(parseRef('bogus:x')).toBeNull();
  });
});
