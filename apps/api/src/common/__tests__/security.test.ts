import { describe, expect, it } from 'vitest';
import { hashPassword, hashToken, verifyPassword } from '../security.js';

describe('security helpers', () => {
  it('hashes session tokens deterministically', () => {
    expect(hashToken('vigie')).toBe(hashToken('vigie'));
    expect(hashToken('vigie')).not.toBe(hashToken('Vigie'));
  });

  it('hashes and verifies passwords', () => {
    const hash = hashPassword('a-strong-password');
    expect(verifyPassword('a-strong-password', hash)).toBe(true);
    expect(verifyPassword('wrong-password', hash)).toBe(false);
  });

  it('rejects malformed password hashes', () => {
    expect(verifyPassword('password', 'invalid')).toBe(false);
  });
});
