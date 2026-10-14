import { describe, expect, it } from 'vitest';
import { walletAcceptsDigest } from '../test/walletCesr';
import { DIGEST_PLACEHOLDER, cesrDigest, sriSha256, toBase64, utf8 } from './cesr';

describe('cesrDigest', () => {
  it('matches the test vector of the swiyu OCA spec', async () => {
    const digest = await cesrDigest({ type: 'spec/capture_base/1.0', digest: '', attributes: { name: 'Text' } });
    expect(digest).toBe('IBYzBHEN4moeVO_aQtW_DbDoQd-30BgeJQMyfsRzoUFI');
  });

  it('does not depend on attribute order', async () => {
    const a = await cesrDigest({ type: 'spec/capture_base/1.0', digest: '', attributes: { a: 'Text', b: 'Numeric' } });
    const b = await cesrDigest({ type: 'spec/capture_base/1.0', digest: '', attributes: { b: 'Numeric', a: 'Text' } });
    expect(a).toBe(b);
  });

  it('produces digests the wallet validator accepts', async () => {
    const captureBase = { type: 'spec/capture_base/1.0', digest: '', attributes: { given_name: 'Text', birth: 'DateTime' } };
    captureBase.digest = await cesrDigest(captureBase);
    expect(captureBase.digest).toHaveLength(DIGEST_PLACEHOLDER.length);
    expect(await walletAcceptsDigest(captureBase)).toBe(true);
  });
});

describe('sriSha256', () => {
  it('uses standard base64 with padding, like the Android SRIValidatorImpl', async () => {
    // printf 'hello' | openssl dgst -sha256 -binary | base64
    expect(await sriSha256(utf8('hello'))).toBe('sha256-LPJNul+wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ=');
  });
});

describe('toBase64', () => {
  it('encodes bytes', () => {
    expect(toBase64(utf8('Grüezi'))).toBe('R3LDvGV6aQ==');
  });
});
