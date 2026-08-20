import { encode as encodeBlurhash } from 'blurhash';
import sharp, { type Metadata } from 'sharp';

/**
 * docs/08-media.md §3 and docs/12 §7 — every uploaded raster is re-encoded.
 *
 * Re-encoding is the point: it destroys any embedded active content, and
 * `.withMetadata({})` strips EXIF including GPS. SVG is rejected outright for
 * covers; only brand logos may be SVG, and those go through sanitiseSvg().
 */

export const COVER_SIZES = [1600, 800, 400] as const;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_DIMENSION = 8000;
export const MIN_COVER_WIDTH = 800;
export const MIN_COVER_HEIGHT = 450;

export type ImageKind = 'jpeg' | 'png' | 'webp' | 'avif' | 'gif' | 'svg' | 'unknown';

/** docs/12 §7 — the type is decided by magic bytes, not by Content-Type. */
export function sniffImageKind(buffer: Uint8Array): ImageKind {
  const b = buffer;
  if (b.length < 12) return 'unknown';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'gif';
  const riff = String.fromCharCode(b[0]!, b[1]!, b[2]!, b[3]!);
  const webp = String.fromCharCode(b[8]!, b[9]!, b[10]!, b[11]!);
  if (riff === 'RIFF' && webp === 'WEBP') return 'webp';
  const ftyp = String.fromCharCode(b[4]!, b[5]!, b[6]!, b[7]!);
  if (ftyp === 'ftyp') {
    const brand = String.fromCharCode(b[8]!, b[9]!, b[10]!, b[11]!);
    if (brand.startsWith('avif') || brand.startsWith('avis') || brand.startsWith('mif1')) return 'avif';
  }
  const head = new TextDecoder().decode(b.subarray(0, Math.min(256, b.length))).trimStart();
  if (head.startsWith('<?xml') || head.startsWith('<svg')) return 'svg';
  return 'unknown';
}

export class ImageRejected extends Error {
  constructor(readonly reason: string) {
    super(`Image rejected: ${reason}`);
    this.name = 'ImageRejected';
  }
}

export type ProcessedCover = {
  blurhash: string;
  variants: Array<{ width: number; format: 'webp' | 'avif'; data: Buffer }>;
  width: number;
  height: number;
};

export async function processCover(input: Uint8Array): Promise<ProcessedCover> {
  if (input.byteLength > MAX_UPLOAD_BYTES) throw new ImageRejected('file is larger than 10 MB');

  const kind = sniffImageKind(input);
  // SVG as a cover is an XSS vector, so it is refused before anything else.
  if (kind === 'svg') throw new ImageRejected('SVG is not accepted as a cover');
  if (!['jpeg', 'png', 'webp', 'avif'].includes(kind)) throw new ImageRejected('unsupported image format');

  const source = sharp(Buffer.from(input), { limitInputPixels: MAX_DIMENSION * MAX_DIMENSION });
  const meta = await source.metadata();
  if (!meta.width || !meta.height) throw new ImageRejected('image dimensions could not be read');
  if (meta.width > MAX_DIMENSION || meta.height > MAX_DIMENSION) throw new ImageRejected('image dimensions are too large');
  if (meta.width < MIN_COVER_WIDTH || meta.height < MIN_COVER_HEIGHT) {
    throw new ImageRejected(`cover must be at least ${MIN_COVER_WIDTH}×${MIN_COVER_HEIGHT}`);
  }

  // Normalise to 16:9, centre crop. withMetadata({}) removes every EXIF tag.
  const base = sharp(Buffer.from(input), { limitInputPixels: MAX_DIMENSION * MAX_DIMENSION })
    .rotate()
    .resize({ width: 1600, height: 900, fit: 'cover', position: 'centre' })
    .withMetadata({});

  const variants: ProcessedCover['variants'] = [];
  for (const width of COVER_SIZES) {
    const height = Math.round((width / 16) * 9);
    const resized = base.clone().resize(width, height, { fit: 'cover' });
    variants.push({ width, format: 'webp', data: await resized.clone().webp({ quality: 82 }).toBuffer() });
    variants.push({ width, format: 'avif', data: await resized.clone().avif({ quality: 60 }).toBuffer() });
  }

  const { data, info } = await base
    .clone()
    .resize(32, 18, { fit: 'cover' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const blurhash = encodeBlurhash(new Uint8ClampedArray(data), info.width, info.height, 4, 3);

  return { blurhash, variants, width: 1600, height: 900 };
}

/** Confirms no metadata survived — used by the EXIF test in docs/08 §8.3. */
export async function readMetadata(buffer: Uint8Array): Promise<Metadata> {
  return sharp(Buffer.from(buffer)).metadata();
}
