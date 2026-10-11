// END-TO-END DEMO (offline, no API keys): the life of a case, using a NON-EXPLICIT stand-in photo.
//   npm run demo [-- --image path/to/standin.jpg] [--jurisdiction IN|US|UK|OTHER]
//
// Story ("Priya", a composite persona; see docs/REAL_WORLD_CASES.md for real documented cases):
//   0  Priya's private photo is copied. A local fake "leak site" will host edited copies of it.
//   1  PROTECT   hash on-device; hash goes to a (simulated) platform blocklist
//   2  PLATFORM  the leaker re-uploads edited copies: which ones does the platform block?
//   3  DISCOVER  Priya pastes the leak-site links into the case: engine verifies which images are really hers
//   4  TAKEDOWN  draft the removal request (Rule 3(2)(b) for IN / TAKE IT DOWN Act for US), log it, start the clock
//   5  TRACK     the site removes one page: re-check detects it; evidence export + tamper test of the ledger
// The "leak site" is a local web server serving ordinary images. No explicit content is involved anywhere.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import sharp from 'sharp';
import { parseArgs } from 'node:util';

import { makeVariants } from '../src/eval/transforms';
import { createCase, addUrl, verifyUrl, recheck, recordReport, recordResponse, saveCase, verifyChain, loadCase } from '../src/cases/store';
import { draftTakedown } from '../src/cases/takedown';
import { exportEvidence } from '../src/cases/export';
import { HashBlocklist } from '../src/moderation/blocklist';
import { checkUpload } from '../src/moderation/checkUpload';
import { printStatus } from '../src/casecli';
import { config } from '../src/config';

async function main() {
  process.env.ALLOW_PRIVATE_HOSTS = '1'; // lets the verifier fetch from the local demo server (test mode only; read at call time)
  const { values: v } = parseArgs({ options: { image: { type: 'string' }, jurisdiction: { type: 'string' } } });
  const pick = (dir: string) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).map((f) => path.join(dir, f)) : []);
  const pool = [...pick('testdata/originals'), ...pick('testdata/faces')];
  const standIn = v.image ?? pool[0];
  if (!standIn) { console.error('Provide --image <non-explicit photo> or run: npm run testdata'); process.exit(1); }
  const original = fs.readFileSync(standIn);
  const decoySrc = pool.find((p) => path.resolve(p) !== path.resolve(standIn));
  const decoy = decoySrc ? fs.readFileSync(decoySrc)
    : await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 128, g: 128, b: 128 }, noise: { type: 'gaussian', mean: 128, sigma: 60 } } }).jpeg().toBuffer();
  const jurisdiction = (v.jurisdiction ?? 'IN') as 'IN' | 'US' | 'UK' | 'OTHER';
  const H = (t: string) => console.log(`\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`);

  H('0. SETUP: a fake "leak site" hosting edited copies of the stand-in photo');
  const variants = Object.fromEntries((await makeVariants(original)).map((x: { name: string; buffer: Buffer }) => [x.name, x.buffer]));
  const state = { removed102: false, removed101Image: false };
  const media: Record<string, Buffer> = { '101-a.jpg': variants.resize_50, '101-b.jpg': decoy, '102-a.jpg': variants.mirror, '102-b.jpg': variants.watermark_handle, '103-a.jpg': decoy };
  const server = http.createServer((req, res) => {
    const url = req.url ?? '';
    const page = (imgs: string[]) => `<html><head><title>post</title></head><body>${imgs.map((i) => `<img src="/media/${i}" width="600">`).join('')}</body></html>`;
    if (url.startsWith('/media/')) { const b = media[url.slice(7)]; return b ? (res.writeHead(200, { 'content-type': 'image/jpeg' }), res.end(b)) : (res.writeHead(404), res.end()); }
    if (url === '/post/101') return (res.writeHead(200, { 'content-type': 'text/html' }), res.end(page(state.removed101Image ? ['101-b.jpg'] : ['101-a.jpg', '101-b.jpg'])));
    if (url === '/post/102') return state.removed102 ? (res.writeHead(404), res.end('gone')) : (res.writeHead(200, { 'content-type': 'text/html' }), res.end(page(['102-a.jpg', '102-b.jpg'])));
    if (url === '/post/103') return (res.writeHead(200, { 'content-type': 'text/html' }), res.end(page(['103-a.jpg'])));
    res.writeHead(404); res.end();
  });
  await new Promise<void>((r) => server.listen(8899, '127.0.0.1', r));
  const base = 'http://127.0.0.1:8899';
  console.log(`stand-in photo : ${standIn}\nleak site      : ${base}   (/post/101 resized copy | /post/102 mirrored + watermarked copies | /post/103 unrelated photo)`);

  try {
    H('1. PROTECT: hash on the device, submit only the hash');
    const c = await createCase(original, 'Demo case (stand-in photo)', jurisdiction);
    console.log(`case ${c.id}  jurisdiction ${jurisdiction}\nPDQ-style hash : ${c.hashPackage.hash}\n(quality ${c.hashPackage.quality}/100). Only this 64-hex-char string leaves the device, never the image.`);
    const demoList = path.join(config.dataDir, 'moderation', 'demo-blocklist.json');
    fs.rmSync(demoList, { force: true });
    const list = new HashBlocklist(demoList);
    list.add(c.hashPackage.hash, c.id);
    console.log('Hash added to the (simulated) platform blocklist. In real life: create the hash on stopncii.org instead.');

    H('2. PLATFORM GATE: the leaker uploads edited copies. What gets blocked?');
    console.log('upload                 decision   PDQ dist  note');
    const attempts: Array<[string, Buffer]> = [
      ['same file', original], ['recompressed q30', variants.jpeg_q30], ['resized 50%', variants.resize_50], ['mirrored', variants.mirror],
      ['grayscale', variants.grayscale], ['watermark added', variants.watermark_handle], ['cropped 80%', variants.crop_center_80],
      ['white border added', variants.white_border], ['rotated 7 degrees', variants.rotate_7deg], ['unrelated photo', decoy],
    ];
    for (const [name, buf] of attempts) {
      const d = await checkUpload(buf, list);
      console.log(`${name.padEnd(22)} ${d.action.toUpperCase().padEnd(10)} ${String(d.match?.distance ?? '-').padStart(6)}    ${d.action === 'allow' && name !== 'unrelated photo' ? 'MISSED: edited too much for this hash: needs its own hash / the discovery engine' : ''}`);
    }
    console.log('\nLesson: hash-matching stops the SAME picture (and light edits) at upload time on participating platforms.\nCrops, borders and rotations slip through: that is why discovery + takedown tracking are still needed.');

    H('3. DISCOVER: Priya has three links from friends/alerts. Which really contain her photo?');
    for (const p of ['/post/101', '/post/102', '/post/103']) addUrl(c, base + p);
    for (const u of c.urls) { await verifyUrl(c, u); const m = u.verification; console.log(`${u.id}  ${u.url.padEnd(34)} -> ${u.status.toUpperCase().padEnd(10)} ${m ? `${m.matchType} (score ${m.score})  ${m.reasons[0]}` : u.lastCheck?.note}`); }

    H(`4. TAKEDOWN: draft + log the request (${jurisdiction})`);
    const u1 = c.urls[0];
    const d = draftTakedown(c, u1, 'intermediary');
    console.log(d.text.split('\n').slice(0, 14).join('\n') + '\n   [...]\n');
    const rep = recordReport(c, u1, d.channel, d.basis, 'DEMO-0001');
    recordReport(c, c.urls[1], d.channel, d.basis, 'DEMO-0002');
    console.log(`Logged. ${rep.deadlineAt ? `Statutory clock for the platform ends ${rep.deadlineAt}.` : 'No statutory clock for this jurisdiction: track manually.'}`);

    H('5. TRACK: the site removes a page; Priya re-checks');
    state.removed102 = true; state.removed101Image = true;
    for (const r of await recheck(c)) console.log(`${r.id}: ${r.before} -> ${r.after.toUpperCase()}   (${r.note})`);
    const c2 = loadCase(c.id);
    recordResponse(c2, c2.urls[0], 'removed', 'platform confirmed removal by email');
    printStatus(c.id);

    H('6. EVIDENCE + INTEGRITY');
    const out = exportEvidence(loadCase(c.id));
    console.log(`Evidence file (no images): ${out}`);
    const fresh = loadCase(c.id);
    console.log(`Ledger check on the real case: ${JSON.stringify(verifyChain(fresh))}`);
    const tampered = JSON.parse(JSON.stringify(fresh));
    tampered.events[2].data = { url: 'http://tampered' };
    console.log(`Ledger check after editing event #3 : ${JSON.stringify(verifyChain(tampered))}   <- tampering is detectable`);
    saveCase(fresh);
  } finally {
    server.close();
  }
  console.log('\nDemo finished.');
}
main().catch((e) => { console.error(e); process.exit(1); });
