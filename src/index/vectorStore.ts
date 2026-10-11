// A deliberately simple vector store: JSON-lines on disk, brute-force search in memory.
// Fine up to ~100k images. Swap for pgvector/Qdrant behind the same few methods when needed.
// WHAT WE STORE: {pageUrl, imageUrl, pHash, embedding}. NEVER the image bytes (privacy + legal).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config';
import { b64ToF32, cosine, domainOf, f32ToB64, hamming } from '../util/math';

export interface IndexRecord {
  id: string;
  pageUrl: string;
  imageUrl: string;
  localPath?: string; // only for locally indexed folders (test corpora)
  phash: string;
  embedding: Float32Array;
  embedder: string;   // vectors from different models are NOT comparable
  domain: string;
  addedAt: string;
}

class FileVectorStore {
  private file = path.join(config.dataDir, 'index', 'records.jsonl');
  private records: IndexRecord[] = [];
  private keys = new Set<string>();

  constructor() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    if (!fs.existsSync(this.file)) return;
    for (const line of fs.readFileSync(this.file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const j = JSON.parse(line);
        const rec: IndexRecord = { ...j, embedding: b64ToF32(j.embedding) };
        this.records.push(rec);
        this.keys.add(rec.imageUrl);
      } catch { /* skip a corrupt line */ }
    }
  }

  get size() { return this.records.length; }
  has(imageUrl: string) { return this.keys.has(imageUrl); }

  add(r: Omit<IndexRecord, 'id' | 'domain' | 'addedAt'>): boolean {
    if (this.keys.has(r.imageUrl)) return false; // de-duplicate by image URL
    const rec: IndexRecord = {
      ...r,
      id: crypto.createHash('sha1').update(r.imageUrl).digest('hex').slice(0, 16),
      domain: domainOf(r.pageUrl),
      addedAt: new Date().toISOString(),
    };
    this.records.push(rec);
    this.keys.add(rec.imageUrl);
    fs.appendFileSync(this.file, JSON.stringify({ ...rec, embedding: f32ToB64(rec.embedding) }) + '\n');
    return true;
  }

  searchByEmbedding(vec: Float32Array, embedder: string, k: number, minCos: number) {
    return this.records
      .filter((r) => r.embedder === embedder)
      .map((record) => ({ record, score: cosine(vec, record.embedding) }))
      .filter((x) => x.score >= minCos)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  searchByPhash(hash: string, maxDist: number, k: number) {
    return this.records
      .map((record) => ({ record, dist: hamming(hash, record.phash) }))
      .filter((x) => x.dist <= maxDist)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, k);
  }
}

let store: FileVectorStore | null = null;
export const getStore = () => (store ??= new FileVectorStore());
export const resetStoreForTests = () => { store = null; };
