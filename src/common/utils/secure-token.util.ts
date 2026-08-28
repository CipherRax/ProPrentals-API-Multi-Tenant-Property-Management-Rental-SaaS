import { createHash, randomBytes } from 'crypto';

// Shared helper for every single-use/expiring token in the system
// (refresh tokens, password resets, tenant invitations, ...). Only the
// hash is ever persisted — the raw token exists only in the response
// returned once at creation time.
export function generateSecureToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashSecureToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
