export type ImageMime = 'image/png' | 'image/jpeg';

export interface ImageInfo {
  /** MIME type declared in the data URL, or null when it is not a PNG/JPEG base64 data URL. */
  declaredMime: ImageMime | null;
  /** MIME type detected from the first bytes, or null when unknown. */
  actualMime: ImageMime | null;
  width?: number;
  height?: number;
}

const DATA_URL = /^data:(image\/png|image\/jpeg);base64,(.*)$/s;

function decodeBase64Prefix(base64: string, maxBytes: number): Uint8Array {
  // Decode only what is needed; 4 base64 characters give 3 bytes.
  const chunk = base64.slice(0, Math.ceil(maxBytes / 3) * 4).replace(/[^A-Za-z0-9+/]/g, '');
  const usable = chunk.slice(0, chunk.length - (chunk.length % 4));
  const binary = atob(usable);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function pngSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  if (bytes.length < 24) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function jpegSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return undefined;
    const marker = bytes[offset + 1];
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isStartOfFrame) {
      return { height: (bytes[offset + 5] << 8) | bytes[offset + 6], width: (bytes[offset + 7] << 8) | bytes[offset + 8] };
    }
    offset += 2 + length;
  }
  return undefined;
}

/** Reads the declared and actual type and the pixel size of a PNG/JPEG data URL without decoding the image. */
export function imageInfo(dataUrl: string): ImageInfo {
  const match = DATA_URL.exec(dataUrl);
  if (!match) return { declaredMime: null, actualMime: null };
  const declaredMime = match[1] as ImageMime;
  let bytes: Uint8Array;
  try {
    bytes = decodeBase64Prefix(match[2], 64 * 1024);
  } catch {
    return { declaredMime, actualMime: null };
  }
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (isPng) return { declaredMime, actualMime: 'image/png', ...pngSize(bytes) };
  if (isJpeg) return { declaredMime, actualMime: 'image/jpeg', ...jpegSize(bytes) };
  return { declaredMime, actualMime: null };
}
