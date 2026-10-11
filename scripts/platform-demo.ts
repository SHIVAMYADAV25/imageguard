// npm run platform -- <image>   : act as a platform: which edited copies of <image> would the hash gate catch?
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeVariants } from '../src/eval/transforms';
import { HashBlocklist } from '../src/moderation/blocklist';
import { checkUpload } from '../src/moderation/checkUpload';
import { pdq } from '../src/hashing/pdq';

async function main() {
  const f = process.argv[2];
  if (!f) { console.error('usage: npm run platform -- <image>'); process.exit(1); }
  const img = fs.readFileSync(f);
  const list = new HashBlocklist(path.join(os.tmpdir(), `ig-bl-${Date.now()}.json`));
  list.add((await pdq(img)).hash, 'demo');
  console.log('variant              decision  distance(of 256)  reason');
  for (const v of await makeVariants(img)) {
    const d = await checkUpload(v.buffer, list);
    console.log(`${v.name.padEnd(20)} ${d.action.padEnd(9)} ${String(d.match?.distance ?? '-').padStart(6)}            ${d.reasons[0]}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
