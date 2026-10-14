import { describe, expect, it } from 'vitest';
import { jpegDataUrl, pngDataUrl } from '../test/images';
import { imageInfo } from './image';

describe('imageInfo', () => {
  it('reads PNG and JPEG sizes from the header', () => {
    expect(imageInfo(pngDataUrl(600, 300))).toEqual({ declaredMime: 'image/png', actualMime: 'image/png', width: 600, height: 300 });
    expect(imageInfo(jpegDataUrl(128, 128))).toEqual({ declaredMime: 'image/jpeg', actualMime: 'image/jpeg', width: 128, height: 128 });
  });

  it('detects a declared type that does not match the bytes', () => {
    expect(imageInfo(pngDataUrl(24, 24).replace('image/png', 'image/jpeg'))).toMatchObject({ declaredMime: 'image/jpeg', actualMime: 'image/png' });
  });

  it('rejects anything that is not a PNG or JPEG base64 data URL', () => {
    expect(imageInfo('https://example.ch/logo.png').declaredMime).toBeNull();
    expect(imageInfo('data:image/svg+xml;base64,PHN2Zz4=').declaredMime).toBeNull();
    expect(imageInfo('data:image/png;base64,AAAA').actualMime).toBeNull();
  });
});
