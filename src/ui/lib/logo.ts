export const LOGO_MAX_SIZE = 512;
const ACCEPTED = ['image/png', 'image/jpeg'];

export function isAcceptedImage(file: File): boolean {
  return ACCEPTED.includes(file.type);
}

export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
    reader.readAsDataURL(file);
  });
}

/**
 * The size of an image scaled down so its longest side is at most `max`. Throws when the size is unknown (an SVG
 * without width and height can report 0), so a logo is never replaced by an empty image.
 */
export function scaledSize(width: number, height: number, max: number): { width: number; height: number } {
  if (!width || !height) throw new Error('The browser could not read the size of the image');
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Re-encodes the image as PNG with its longest side at most `max` pixels. */
export async function downscaleLogo(dataUrl: string, max = LOGO_MAX_SIZE): Promise<string> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const size = scaledSize(image.naturalWidth, image.naturalHeight, max);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is not available');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}
