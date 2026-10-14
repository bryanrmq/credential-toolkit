import canonicalize from 'canonicalize';

/** 44 '#' characters: the placeholder length of a CESR SHA-256 digest. */
export const DIGEST_PLACEHOLDER = '#'.repeat(44);

const SHA256_CESR_CODE = 'I';

export async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)));
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/**
 * CESR-encoded SHA-256 digest of an OCA object, as computed by the swiyu wallets:
 * set `digest` to 44 '#', canonicalise with JCS (RFC 8785), hash, prepend one zero byte,
 * base64url without padding, drop the first character, prefix with 'I'.
 */
export async function cesrDigest(object: Record<string, unknown>): Promise<string> {
  const canonical = canonicalize({ ...object, digest: DIGEST_PLACEHOLDER });
  if (canonical === undefined) throw new Error('Object cannot be canonicalised');
  const raw = await sha256(utf8(canonical));
  const padded = new Uint8Array(raw.length + 1);
  padded.set(raw, 1);
  return SHA256_CESR_CODE + toBase64Url(padded).slice(1);
}

/** W3C Subresource Integrity value with standard (not URL-safe) base64, as the wallets compare it. */
export async function sriSha256(bytes: Uint8Array): Promise<string> {
  return `sha256-${toBase64(await sha256(bytes))}`;
}
