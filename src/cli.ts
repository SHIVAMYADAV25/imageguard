// Command-line front end:  npm run search -- --image me.jpg --i-am-owner --i-am-adult [options]
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { runSearch } from './pipeline';
import { IntakeError } from './intake/validate';
import { closeTempHost } from './hosting/tempHost';
import { safeFetch } from './util/http';
import { config } from './config';

const HELP = `
ImageGuard engine - find where an image appears online.

  npm run search -- --image <file> --i-am-owner --i-am-adult [options]
  npm run search -- --image-url <public url> --i-am-owner --i-am-adult

Options
  --image <path>        image to search (the one you own / are authorised to search for)
  --image-url <url>     alternatively, a publicly reachable image URL (skips the temp host)
  --selfie <path>       a selfie of the same person: unlocks face/deepfake region analysis
  --keywords a,b        extra keywords for text search
  --usernames x,y       usernames / handles to search for
  --urls u1,u2          known URLs to verify
  --i-am-owner          REQUIRED attestation: the image shows me / I am authorised to act
  --i-am-adult          REQUIRED attestation: the person shown is 18+
  --json                print the full JSON report
`;

const list = (s?: string) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []);

async function main() {
  const { values: v } = parseArgs({
    options: {
      image: { type: 'string' }, 'image-url': { type: 'string' }, selfie: { type: 'string' },
      keywords: { type: 'string' }, usernames: { type: 'string' }, urls: { type: 'string' },
      'i-am-owner': { type: 'boolean' }, 'i-am-adult': { type: 'boolean' },
      json: { type: 'boolean' }, help: { type: 'boolean' },
    },
  });
  if (v.help || (!v.image && !v['image-url'])) return void console.log(HELP);

  let imageBuffer: Buffer;
  if (v.image) imageBuffer = fs.readFileSync(v.image);
  else imageBuffer = (await safeFetch(v['image-url']!, { maxBytes: config.limits.uploadBytes, allowedTypes: /^image\// })).buffer;

  try {
    const report = await runSearch({
      imageBuffer,
      imageUrl: v['image-url'],
      selfieBuffer: v.selfie ? fs.readFileSync(v.selfie) : undefined,
      keywords: list(v.keywords), usernames: list(v.usernames), knownUrls: list(v.urls),
      declaration: { isOwnerOrAuthorized: !!v['i-am-owner'], isAdult: !!v['i-am-adult'] },
    });
    if (v.json) return void console.log(JSON.stringify(report, null, 2));
    print(report);
  } catch (e) {
    if (e instanceof IntakeError) {
      console.error(`\nREFUSED [${e.code}]: ${e.message}`);
      if (e.refer) console.error(e.refer);
      process.exitCode = 2;
    } else throw e;
  } finally {
    await closeTempHost();
  }
}

function print(r: Awaited<ReturnType<typeof runSearch>>) {
  console.log(`\nSearch ${r.searchId}  (${r.durationMs} ms)`);
  console.log('Connectors:');
  for (const c of r.connectors) console.log(`  ${c.status.padEnd(7)} ${c.name.padEnd(12)} ${String(c.candidates).padStart(4)} candidates  ${c.note ?? ''}`);
  console.log(`Pipeline: ${r.stats.rawCandidates} raw -> ${r.stats.afterMerge} unique -> ${r.stats.matches} verified matches`);
  for (const w of r.warnings) console.log(`  ! ${w}`);
  console.log('');
  r.results.forEach((m, i) => {
    console.log(`#${i + 1} [${m.matchType} ${m.score.toFixed(2)}] ${m.domain}   nsfw=${m.nsfw}   found by: ${m.foundBy.join(', ')}`);
    console.log(`    page  : ${m.pageUrl}`);
    if (m.imageUrl) console.log(`    image : ${m.imageUrl}`);
    console.log(`    why   : ${m.reasons.join(' | ')}`);
    if (m.report) console.log(`    report: ${m.report.name} ${m.report.reportUrl ?? ''}`);
    if (m.thumbnailBlobId) console.log(`    thumb : data/blobs/${m.thumbnailBlobId}.jpg ${m.nsfw === 'safe' ? '' : '(pixelated)'}`);
  });
  if (!r.results.length) console.log('No verified matches.');
  console.log('\nHelpful resources:');
  for (const g of r.resources) console.log(`  - ${g.name}: ${g.url}  (${g.use})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
