import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** AES-256-GCM. Output: v1.<keyId>.<iv>.<tag>.<ciphertext> (base64url) so keys can be rotated. */
export interface KeyRing {
  currentId: string;
  keys: Record<string, Buffer>;
}

export function keyRingFromEnv(env: Record<string, string | undefined>): KeyRing {
  // LENS_ENCRYPTION_KEYS="id1:base64key,id2:base64key" ; first is current. Legacy: LENS_ENCRYPTION_KEY.
  const raw = env.LENS_ENCRYPTION_KEYS ?? (env.LENS_ENCRYPTION_KEY ? `k1:${env.LENS_ENCRYPTION_KEY}` : '');
  if (!raw) throw new Error('LENS_ENCRYPTION_KEYS is not set');
  const keys: Record<string, Buffer> = {};
  let currentId = '';
  for (const part of raw.split(',')) {
    const [id, b64] = part.split(':');
    const key = Buffer.from(b64 ?? '', 'base64');
    if (!id || key.length !== 32) throw new Error(`Encryption key "${id}" must be 32 bytes, base64`);
    keys[id] = key;
    currentId ||= id;
  }
  return { currentId, keys };
}

export function encrypt(plain: string, ring: KeyRing): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', ring.keys[ring.currentId]!, iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  const b = (x: Buffer) => x.toString('base64url');
  return ['v1', ring.currentId, b(iv), b(c.getAuthTag()), b(ct)].join('.');
}

export function decrypt(blob: string, ring: KeyRing): string {
  const [v, id, iv, tag, ct] = blob.split('.');
  if (v !== 'v1' || !id || !iv || !tag || !ct) throw new Error('Malformed ciphertext');
  const key = ring.keys[id];
  if (!key) throw new Error(`Unknown key id ${id}`);
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}

/** True when the blob was written with a non-current key and should be re-encrypted. */
export const needsRotation = (blob: string, ring: KeyRing) => blob.split('.')[1] !== ring.currentId;
