// Text in images: PaddleOCR PP-OCRv4 (ONNX) via @gutenye/ocr-node (models ship inside the npm
// package, so nothing to download). Far more accurate than tesseract on screenshots, stylised
// watermarks and small UI text. Used to harvest @handles, watermark domains and names that feed
// the text-search connector and the "source hints" in the report.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { log } from '../util/log';

let engine: Promise<any> | null = null;
const MIN_CONFIDENCE = 0.6; // drop low-confidence lines: OCR noise creates fake handles

/** Returns the recognised lines joined by newlines, or undefined if OCR is unavailable / finds nothing. */
export async function runOcr(img: Buffer): Promise<string | undefined> {
  const tmp = path.join(os.tmpdir(), `ig-ocr-${crypto.randomBytes(6).toString('hex')}.jpg`);
  try {
    engine ??= (async () => (await import('@gutenye/ocr-node')).default.create())();
    const ocr = await engine;
    // Small images (screenshots, thumbnails) lose thin glyphs such as '_' : enlarge them first.
    const { width = 0 } = await sharp(img, { failOn: 'none' }).metadata();
    fs.writeFileSync(tmp, width && width < 1200 ? await sharp(img, { failOn: 'none' }).resize({ width: 1440 }).jpeg({ quality: 92 }).toBuffer() : img); // the library reads from a path
    const res = await ocr.detect(tmp);
    const lines = (res.texts as Array<{ text: string; mean: number }>).filter((t) => t.mean >= MIN_CONFIDENCE).map((t) => t.text.trim());
    return lines.length ? lines.join('\n') : undefined;
  } catch (e) {
    log.debug('ocr', `OCR unavailable or failed: ${(e as Error).message}`);
    return undefined;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/**
 * @handles, de-duplicated, max 5. OCR often turns '_' into a space ("@priya sharma92"), so when the
 * next token looks like the rest of a handle (starts with '_' or contains a digit) we ALSO emit the
 * joined form. Both go to text search; only pages that really contain the image survive verification.
 */
export function extractHandles(text?: string): string[] {
  if (!text) return [];
  const found: string[] = [];
  const add = (h: string) => { h = h.replace(/^[._]+|[._]+$/g, '').toLowerCase(); if (h.length >= 3 && !found.includes(h)) found.push(h); };
  for (const m of text.matchAll(/@([A-Za-z0-9._]{2,30})(?:[ \t]+([_.]?[A-Za-z0-9._]{2,30}))?/g)) {
    const next = m[2];
    if (next && (/^[_.]/.test(next) || /\d/.test(next))) add(`${m[1].replace(/[._]$/, '')}_${next.replace(/^[_.]/, '')}`); // joined form first
    add(m[1]);
  }
  return found.slice(0, 5);
}

const FILE_EXT = /\.(jpe?g|png|gif|webp|mp4|mov|avi|pdf|txt|html?)$/i;
/** Domain-looking strings (watermarks like "example-site.com"), de-duplicated, max 5. */
export function extractDomains(text?: string): string[] {
  if (!text) return [];
  const found = new Set<string>();
  for (const m of text.matchAll(/\b((?:[a-z0-9][a-z0-9-]{0,40}\.)+[a-z]{2,10})\b/gi)) {
    const d = m[1].toLowerCase();
    if (!FILE_EXT.test(d) && !/^\d+(\.\d+)+$/.test(d)) found.add(d);
  }
  return [...found].slice(0, 5);
}
