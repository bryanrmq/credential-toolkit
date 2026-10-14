function toDataUrl(mime: string, bytes: number[]): string {
  return `data:${mime};base64,${btoa(String.fromCharCode(...bytes))}`;
}

const u32 = (value: number) => [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
const u16 = (value: number) => [(value >>> 8) & 255, value & 255];

/** A PNG data URL whose header declares the given size (image data is not needed by the checks). */
export function pngDataUrl(width: number, height: number): string {
  return toDataUrl('image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...u32(13), 0x49, 0x48, 0x44, 0x52, ...u32(width), ...u32(height), 8, 6, 0, 0, 0]);
}

/** A JPEG data URL with an APP0 segment followed by a SOF0 segment of the given size. */
export function jpegDataUrl(width: number, height: number, declaredMime = 'image/jpeg'): string {
  const app0 = [0xff, 0xe0, ...u16(16), 0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0];
  const sof0 = [0xff, 0xc0, ...u16(17), 8, ...u16(height), ...u16(width), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return toDataUrl(declaredMime, [0xff, 0xd8, ...app0, ...sof0]);
}
