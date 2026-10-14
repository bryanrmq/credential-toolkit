/**
 * Test-only port of the swiyu Android wallet's OcaCesrHashValidatorImpl, written without the
 * production code so that it checks the exporter independently. Its JCS is a plain sorted-key
 * serialisation, which is exact for capture bases (they only contain strings and objects).
 */
function sortedJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(sortedJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${sortedJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export async function walletAcceptsDigest(captureBase: { digest: string } & Record<string, unknown>): Promise<boolean> {
  const dummy = { ...captureBase, digest: '#'.repeat(44) };
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sortedJson(dummy))));
  const padded = new Uint8Array(33);
  padded.set(hash, 1);
  let binary = '';
  for (const byte of padded) binary += String.fromCharCode(byte);
  const base64Url = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `I${base64Url.slice(1)}` === captureBase.digest;
}
