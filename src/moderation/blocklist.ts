// PLATFORM SIDE: a hash blocklist, the way a participating platform consumes StopNCII-style hashes.
// It stores ONLY hashes (never images) and can drop an entry when the victim withdraws their case.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config';
import { hamming } from '../util/math';

export interface BlockEntry { id: string; hash: string; submittedAt: string; caseRef?: string; withdrawn?: boolean }

export class HashBlocklist {
  private entries: BlockEntry[] = [];
  constructor(private file = path.join(config.dataDir, 'moderation', 'blocklist.json')) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file)) this.entries = JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  private save() { fs.writeFileSync(this.file, JSON.stringify(this.entries, null, 2)); }

  add(hash: string, caseRef?: string): BlockEntry {
    const e: BlockEntry = { id: crypto.randomUUID().slice(0, 8), hash, submittedAt: new Date().toISOString(), caseRef };
    this.entries.push(e); this.save(); return e;
  }
  withdraw(id: string) { const e = this.entries.find((x) => x.id === id); if (e) { e.withdrawn = true; this.save(); } }
  get size() { return this.entries.filter((e) => !e.withdrawn).length; }

  /** Closest active entry to an upload (given its 8 dihedral hashes), or null if empty. */
  closest(uploadDihedral: string[]): { entry: BlockEntry; distance: number } | null {
    let best: { entry: BlockEntry; distance: number } | null = null;
    for (const entry of this.entries) {
      if (entry.withdrawn) continue;
      for (const h of uploadDihedral) {
        const d = hamming(entry.hash, h);
        if (!best || d < best.distance) best = { entry, distance: d };
      }
    }
    return best;
  }
}
