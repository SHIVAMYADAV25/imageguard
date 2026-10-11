// EVALUATION HARNESS (Step 3, extended in Steps 4-7): measure precision and recall OFFLINE.
//
//   npm run eval -- [--originals testdata/originals] [--distractors testdata/distractors]
//
// Method
//   1. For every ORIGINAL image make ~15 labelled variants (crop, mirror, filter, ..., face-swap sim).
//   2. Pool = all variants of all originals + all distractor images (unrelated pictures).
//   3. For each original, fingerprint it, then score EVERY pool item with the real engine code
//      (rescore.compareFeatures + score.classify, the same functions the pipeline uses).
//   4. An item is a TRUE POSITIVE if it is accepted and belongs to that original; a FALSE POSITIVE
//      if it is accepted but belongs to another original or is a distractor.
// Outputs: per-variant recall + label accuracy, overall precision, and the cosine/pHash
// separation between positives and negatives (use it to tune thresholds in config.ts / embed.ts).
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { config } from '../config';
import { MatchType } from '../types';
import { computeFingerprint } from '../fingerprint';
import { getEmbedder } from '../fingerprint/embed';
import { faceModelsAvailable } from '../fingerprint/face';
import { analyzeCandidate, compareFeatures, CandidateFeatures } from '../verify/rescore';
import { classify } from '../rank/score';
import { makeVariants } from './transforms';

const IMG = /\.(jpe?g|png|webp)$/i;
const readDir = (d: string) => (fs.existsSync(d) ? fs.readdirSync(d).filter((f) => IMG.test(f)).map((f) => path.join(d, f)) : []);

interface PoolItem { parent: number | null; variant: string; expected: MatchType | null; feats: CandidateFeatures }

async function main() {
  const { values: v } = parseArgs({ options: { originals: { type: 'string' }, distractors: { type: 'string' } } });
  const originals = readDir(path.resolve(v.originals ?? 'testdata/originals'));
  const distractors = readDir(path.resolve(v.distractors ?? 'testdata/distractors'));
  if (originals.length < 2) { console.error('Need >= 2 images in testdata/originals (try: npm run testdata).'); process.exit(1); }

  const embedder = await getEmbedder();
  const withFace = faceModelsAvailable();
  console.log(`Embedder: ${embedder.name} | face models: ${withFace ? 'yes' : 'NO (face-swap variants skipped)'}`);
  console.log(`${originals.length} originals, ${distractors.length} distractors\n`);

  // ---- build the pool (expensive part: decode + embed each item exactly once) ---------------
  const pool: PoolItem[] = [];
  const fps = [];
  for (let i = 0; i < originals.length; i++) {
    const buf = fs.readFileSync(originals[i]);
    const donor = withFace ? fs.readFileSync(originals[(i + 1) % originals.length]) : undefined;
    fps.push(await computeFingerprint(buf, { withFace })); // harness bypasses the ownership gate: all test images are ours
    for (const variant of await makeVariants(buf, donor))
      pool.push({ parent: i, variant: variant.name, expected: variant.expected, feats: await analyzeCandidate(variant.buffer, withFace) });
    process.stdout.write(`\rprepared ${i + 1}/${originals.length}`);
  }
  for (const d of distractors) pool.push({ parent: null, variant: 'distractor', expected: null, feats: await analyzeCandidate(fs.readFileSync(d), withFace) });
  console.log(`\npool size: ${pool.length}\n`);

  // ---- score every (query, pool item) pair ---------------------------------------------------
  type Row = { n: number; retrieved: number; labelOk: number; minEmb: number; confusion: Record<string, number> };
  const per = new Map<string, Row>();
  let tp = 0, fp = 0, negMaxEmb = -1, negMaxPhashSim = 0;
  const fpExamples: string[] = [];

  fps.forEach((q, i) => {
    for (const item of pool) {
      const s = compareFeatures(q, item.feats);
      const verdict = classify(s, embedder.calib);
      const accepted = verdict.matchType !== null;
      if (item.parent === i) {
        const r = per.get(item.variant) ?? { n: 0, retrieved: 0, labelOk: 0, minEmb: 1, confusion: {} };
        r.n++; r.minEmb = Math.min(r.minEmb, s.embedding);
        if (accepted) { r.retrieved++; tp++; }
        if (verdict.matchType === item.expected) r.labelOk++;
        const k = verdict.matchType ?? 'none';
        r.confusion[k] = (r.confusion[k] ?? 0) + 1;
        per.set(item.variant, r);
      } else {
        negMaxEmb = Math.max(negMaxEmb, s.embedding);
        negMaxPhashSim = Math.max(negMaxPhashSim, s.phash);
        if (accepted) {
          fp++;
          if (fpExamples.length < 5) fpExamples.push(`query#${i} accepted ${item.parent === null ? 'a distractor' : `variant "${item.variant}" of #${item.parent}`} as ${verdict.matchType} (emb ${s.embedding.toFixed(3)})`);
        }
      }
    }
  });

  // ---- report -------------------------------------------------------------------------------
  const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(0) + '%' : '-').padStart(5);
  console.log('variant              n   recall  label-ok  min-cos  confusion');
  for (const [name, r] of per)
    console.log(`${name.padEnd(18)} ${String(r.n).padStart(3)}  ${pct(r.retrieved, r.n)}   ${pct(r.labelOk, r.n)}    ${r.minEmb.toFixed(3)}  ${JSON.stringify(r.confusion)}`);
  const precision = tp + fp ? tp / (tp + fp) : 1;
  console.log(`\nOVERALL  precision=${(100 * precision).toFixed(1)}%  (TP=${tp}, FP=${fp})`);
  console.log(`Negatives: highest embedding cosine seen = ${negMaxEmb.toFixed(3)}, highest pHash similarity = ${negMaxPhashSim.toFixed(3)}`);
  console.log(`Tuning hint: positives you want to keep should have min-cos ABOVE ${negMaxEmb.toFixed(3)}; set embed.ts "similar" just above it.`);
  if (fpExamples.length) console.log('False-positive examples:\n  ' + fpExamples.join('\n  '));

  const out = path.join(config.dataDir, 'reports', `eval-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ embedder: embedder.name, tp, fp, precision, per: Object.fromEntries(per) }, null, 2));
  console.log(`\nSaved ${out}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
