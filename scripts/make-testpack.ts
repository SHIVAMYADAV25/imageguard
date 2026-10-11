// npm run testpack -- <non-explicit-stand-in.jpg> [donor-face.jpg]
// Builds testdata/pack/: everything needed to rehearse a case WITHOUT any real victim material:
//   original.jpg            the stand-in "private photo"
//   variants/*.jpg          labelled edited copies (see expected labels printed below)
//   screenshot_post.jpg     a fake social-media post containing the photo + an @handle + a watermark domain
//                           (tests PaddleOCR source hints; the handle/domain are made-up placeholders)
//   index.html              a page embedding every variant: host it anywhere public (or any static host you
//                           control) and feed its URL to `npm run case -- add-url`
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { makeVariants } from '../src/eval/transforms';
import { normalize } from '../src/util/image';

async function main() {
  const [src, donor] = process.argv.slice(2);
  if (!src) { console.error('usage: npm run testpack -- <stand-in image> [donor image]'); process.exit(1); }
  const out = path.resolve('testdata/pack');
  fs.mkdirSync(path.join(out, 'variants'), { recursive: true });
  const original = await normalize(fs.readFileSync(src));
  fs.writeFileSync(path.join(out, 'original.jpg'), original);

  const vs = await makeVariants(original, donor ? fs.readFileSync(donor) : undefined);
  for (const v of vs) fs.writeFileSync(path.join(out, 'variants', `${v.name}.jpg`), v.buffer);

  // Fake "post screenshot": dark card, the photo, a handle line and a watermark line.
  const photo = await sharp(original).resize(620, 620, { fit: 'inside' }).toBuffer();
  const pm = await sharp(photo).metadata();
  const card = Buffer.from(`<svg width="720" height="${(pm.height ?? 620) + 260}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#16181c"/>
    <text x="50" y="70" font-size="34" fill="#ffffff" font-family="DejaVu Sans, sans-serif">@priya_sharma92</text>
    <text x="50" y="${(pm.height ?? 620) + 175}" font-size="30" fill="#ffd54f" font-family="DejaVu Sans, sans-serif">watermark-site-example.com</text></svg>`);
  await sharp(card).composite([{ input: photo, left: 50, top: 100 }]).jpeg({ quality: 90 }).toFile(path.join(out, 'screenshot_post.jpg'));

  fs.writeFileSync(path.join(out, 'index.html'), `<html><head><title>test pack</title></head><body>\n${vs.map((v) => `<h4>${v.name} (expected: ${v.expected})</h4><img src="variants/${v.name}.jpg" width="400">`).join('\n')}\n<h4>screenshot (OCR test)</h4><img src="screenshot_post.jpg" width="400">\n</body></html>`);
  console.log(`Wrote ${out}\n\nvariant              expected label`);
  for (const v of vs) console.log(`${v.name.padEnd(20)} ${v.expected}${v.note ? `   (${v.note})` : ''}`);
  console.log('\nNext: npm run search -- --image testdata/pack/screenshot_post.jpg --i-am-owner --i-am-adult   (look at "hints")');
}
main().catch((e) => { console.error(e); process.exit(1); });
