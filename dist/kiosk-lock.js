export const LOCK_KEY = 'passpoint.kiosk.v1';

export async function deriveKey(passphrase, salt) {
  const bytes = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', bytes.encode(passphrase), 'PBKDF2', false, ['deriveBits']);
  const hash = await crypto.subtle.deriveBits({
    name: 'PBKDF2', salt: bytes.encode(salt), iterations: 210000, hash: 'SHA-256',
  }, key, 256);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}
