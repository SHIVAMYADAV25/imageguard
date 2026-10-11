// Thumbnail storage. Content-addressed files in data/blobs (swap for S3 + TTL in production).
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config';
import { sha256 } from '../util/math';

export function saveBlob(buf: Buffer): string {
  const id = sha256(buf).slice(0, 16);
  const dir = path.join(config.dataDir, 'blobs');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.jpg`), buf);
  return id;
}
export const blobPath = (id: string) => path.join(config.dataDir, 'blobs', `${id.replace(/[^a-f0-9]/g, '')}.jpg`);
