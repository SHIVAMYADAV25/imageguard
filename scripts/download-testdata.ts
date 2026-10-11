// npm run testdata  - downloads PUBLIC-DOMAIN / openly licensed test images.
//  * testdata/originals  : famous public-domain artworks + photos (they exist all over the web,
//                          so reverse-image search SHOULD find them: ideal positive controls)
//  * testdata/distractors: unrelated public-domain pictures (negative controls)
//  * testdata/faces      : two photos of the same public figure + one of someone else, from the
//                          MIT-licensed face_recognition repo, to test the ownership gate / face logic
import fs from 'node:fs';
import path from 'node:path';

const UA = 'ImageGuardTestData/0.1 (research prototype; contact: you@example.com)';
const commons = (file: string) => `https://commons.wikimedia.org/wiki/Special:FilePath/${file}?width=1024`;
const gh = (p: string) => `https://raw.githubusercontent.com/ageitgey/face_recognition/master/examples/${p}`;

const FILES: Array<[dir: string, name: string, url: string]> = [
  ['originals', 'great_wave.jpg', commons('The_Great_Wave_off_Kanagawa.jpg')],
  ['originals', 'starry_night.jpg', commons('Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg')],
  ['originals', 'earth_apollo17.jpg', commons('The_Earth_seen_from_Apollo_17.jpg')],
  ['originals', 'einstein_head.jpg', commons('Albert_Einstein_Head.jpg')],
  ['originals', 'lincoln_1863.jpg', commons('Abraham_Lincoln_O-77_matte_collodion_print.jpg')],
  ['originals', 'girl_pearl_earring.jpg', commons('1665_Girl_with_a_Pearl_Earring.jpg')],
  ['originals', 'mona_lisa.jpg', commons('Mona_Lisa,_by_Leonardo_da_Vinci,_from_C2RMF_retouched.jpg')],
  ['distractors', 'full_moon.jpg', commons('FullMoon2010.jpg')],
  ['faces', 'obama.jpg', gh('obama.jpg')],
  ['faces', 'obama2.jpg', gh('obama2.jpg')],
  ['faces', 'biden.jpg', gh('biden.jpg')],
];

async function main() {
  for (const [dir, name, url] of FILES) {
    const dest = path.resolve('testdata', dir, name);
    if (fs.existsSync(dest)) { console.log(`have  ${dir}/${name}`); continue; }
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
      console.log(`saved ${dir}/${name}`);
    } catch (e) {
      console.warn(`FAILED ${dir}/${name}: ${(e as Error).message}  (download it manually into testdata/${dir}/)`);
    }
  }
}
main();
