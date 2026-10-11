// STEP 1 check: do crops, filters and recompression still match under pHash + embedding?
//   npm run step1 -- path/to/photo.jpg [more.jpg ...]        (default: everything in testdata/originals)
// Prints, for each transform, the pHash Hamming distance and embedding cosine versus the original,
// plus a CONTROL row against a different image (which must score low).
import fs from 'node:fs';
import path from 'node:path';
import { phash } from '../src/fingerprint/phash';
import { getEmbedder } from '../src/fingerprint/embed';
import { hamming, cosine } from '../src/util/math';
import { normalize } from '../src/util/image';
import { makeVariants } from '../src/eval/transforms';

async function main() {
  let files = process.argv.slice(2);
  if (!files.length) {
    const d = path.resolve('testdata/originals');
    files = fs.existsSync(d) ? fs.readdirSync(d).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).map((f) => path.join(d, f)) : [];
  }
  if (files.length < 1) { console.error('Provide an image path, or run: npm run testdata'); process.exit(1); }

  const embedder = await getEmbedder();
  console.log(`Embedder: ${embedder.name}\n`);

  const prepare = async (buf: Buffer) => {
    const n = await normalize(buf);
    return { h: await phash(n), hf: await phash(n, true), e: await embedder.embed(n) };
  };

  const control = files.length > 1 ? await prepare(fs.readFileSync(files[1])) : null;
  const src = fs.readFileSync(files[0]);
  const orig = await prepare(src);
  console.log(`Original: ${files[0]}  pHash=${orig.h}\n`);
  console.log('variant              pHash-dist  cosine   expected          verdict');

  for (const v of await makeVariants(src)) {
    const p = await prepare(v.buffer);
    const dist = Math.min(hamming(orig.h, p.h), hamming(orig.hf, p.h));
    const cos = cosine(orig.e, p.e);
    // Same decision rule as the engine, simplified: close in either space => "matches".
    const matches = dist <= 12 || cos >= embedder.calib.similar;
    console.log(`${v.name.padEnd(20)} ${String(dist).padStart(5)}      ${cos.toFixed(3)}   ${v.expected.padEnd(16)}  ${matches ? 'MATCH' : 'miss  <-- check'}`);
  }
  if (control) {
    const dist = Math.min(hamming(orig.h, control.h), hamming(orig.hf, control.h));
    const cos = cosine(orig.e, control.e);
    const matches = dist <= 12 || cos >= embedder.calib.similar;
    console.log(`\nCONTROL (different image ${path.basename(files[1])}): dist=${dist} cos=${cos.toFixed(3)} -> ${matches ? 'FALSE MATCH <-- bad' : 'no match (good)'}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
