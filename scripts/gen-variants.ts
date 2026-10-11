// Make real-world test inputs from ANY image you own:
//   npm run variants -- me.jpg [donor-face.jpg]
// Writes testdata/variants/<name>/*.jpg. Upload these to a test page / social account you control,
// wait for indexing, then search with the ORIGINAL and see which variants the engine finds.
import fs from 'node:fs';
import path from 'node:path';
import { makeVariants } from '../src/eval/transforms';

async function main() {
  const [src, donor] = process.argv.slice(2);
  if (!src) { console.error('usage: npm run variants -- <image> [donor-image]'); process.exit(1); }
  const dir = path.resolve('testdata/variants', path.basename(src, path.extname(src)));
  fs.mkdirSync(dir, { recursive: true });
  for (const v of await makeVariants(fs.readFileSync(src), donor ? fs.readFileSync(donor) : undefined)) {
    fs.writeFileSync(path.join(dir, `${v.name}.jpg`), v.buffer);
    console.log(`${v.name.padEnd(18)} expected: ${v.expected}${v.note ? `   (${v.note})` : ''}`);
  }
  console.log(`\nWritten to ${dir}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
