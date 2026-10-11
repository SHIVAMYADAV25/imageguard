// Stage 1a: is the upload an image we can safely process?
import sharp from 'sharp';
import { config } from '../config';

export class IntakeError extends Error {
  constructor(public code: string, message: string, public refer?: string) {
    super(message);
  }
}

const OK_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'tiff', 'avif', 'heif']);

export async function validateUpload(buf: Buffer): Promise<{ width: number; height: number; format: string }> {
  if (!buf?.length) throw new IntakeError('empty', 'No image provided.');
  if (buf.length > config.limits.uploadBytes) throw new IntakeError('too_large', 'Image is larger than 10 MB.');
  let meta;
  try {
    // sharp reads the real header: we never trust the filename or declared MIME type.
    meta = await sharp(buf, { failOn: 'none', limitInputPixels: 60_000_000 }).metadata();
  } catch {
    throw new IntakeError('not_image', 'File is not a readable image.');
  }
  if (!meta.format || !OK_FORMATS.has(meta.format)) throw new IntakeError('bad_format', `Unsupported format: ${meta.format}`);
  const width = meta.width ?? 0, height = meta.height ?? 0;
  if (width < 64 || height < 64) throw new IntakeError('too_small', 'Image must be at least 64x64 pixels.');
  return { width, height, format: meta.format };
}
