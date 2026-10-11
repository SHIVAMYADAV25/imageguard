// npm run faces  - eyeball + measure the face stack on testdata/faces (or your own folder).
// Writes annotated images to testdata/out/ (box + 5 landmarks + aligned 112x112 crop info)
// and prints an ArcFace cosine matrix: same-person pairs should be >= ~0.35, different <= ~0.2.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { detectFaces, detectLargestFace, faceEmbedding, faceModelsAvailable, detectorName } from '../src/fingerprint/face';
import { cosine } from '../src/util/math';

async function main() {
  const dir = path.resolve(process.argv[2] ?? 'testdata/faces');
  const files = fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
  fs.mkdirSync('testdata/out', { recursive: true });
  console.log(`detector: ${detectorName()}  | ArcFace present: ${faceModelsAvailable()}\n`);
  const embs: Array<{ f: string; e: Float32Array }> = [];
  for (const f of files) {
    const buf = fs.readFileSync(path.join(dir, f));
    const faces = await detectFaces(buf);
    console.log(`${f}: ${faces.length} face(s)` + faces.map((b) => `  box=[${[b.x, b.y, b.w, b.h].map(Math.round)}] score=${b.score.toFixed(2)} landmarks=${b.kps ? 'yes' : 'no'}`).join(''));
    const { width: W = 0, height: H = 0 } = await sharp(buf).metadata();
    const shapes = faces.map((b) => `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="none" stroke="lime" stroke-width="4"/>` + (b.kps ?? []).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6" fill="red"/>`).join('')).join('');
    await sharp(buf).composite([{ input: Buffer.from(`<svg width="${W}" height="${H}">${shapes}</svg>`) }]).jpeg().toFile(path.join('testdata/out', `annotated_${f.replace(/\.\w+$/, '')}.jpg`));
    const big = await detectLargestFace(buf);
    if (big && faceModelsAvailable()) embs.push({ f, e: await faceEmbedding(buf, big) });
  }
  if (embs.length > 1) {
    console.log('\nArcFace cosine matrix');
    console.log(''.padEnd(14) + embs.map((x) => x.f.slice(0, 10).padEnd(11)).join(''));
    for (const a of embs) console.log(a.f.slice(0, 13).padEnd(14) + embs.map((b) => cosine(a.e, b.e).toFixed(3).padEnd(11)).join(''));
  }
  console.log('\nAnnotated images: testdata/out/  (green box, red landmarks: eyes, nose, mouth corners)');
}
main().catch((e) => { console.error(e); process.exit(1); });
