import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/** Computes the deterministic SHA-256 digest used to persist session tokens. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Hashes a password with scrypt and a cryptographically random salt. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

/** Verifies a password against a Vigie scrypt password hash. */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [, saltHex, keyHex] = storedHash.split('$');
    if (!saltHex || !keyHex) return false;
    const expected = Buffer.from(keyHex, 'hex');
    const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
