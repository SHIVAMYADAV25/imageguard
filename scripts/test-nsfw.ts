
import fs from 'node:fs';
import path from 'node:path';
import { classifyNsfw, nsfwModelAvailable } from '../src/verify/nsfw';

async function main() {
  const imagePath = process.argv[2];

  if (!imagePath) {
    console.error(
      'Usage: npx tsx scripts/test-nsfw.ts <image-path>'
    );
    process.exitCode = 1;
    return;
  }

  if (!fs.existsSync(imagePath)) {
    console.error(`Image not found: ${imagePath}`);
    process.exitCode = 1;
    return;
  }

  if (!nsfwModelAvailable()) {
    console.error('NSFW model missing: check models/nsfw_nudenet.onnx');
    process.exitCode = 1;
    return;
  }

  try {
    const image = fs.readFileSync(imagePath);
    const label = await classifyNsfw(image);

    console.log({
      image: path.basename(imagePath),
      bytes: image.length,
      nsfwLabel: label,
      modelAvailable: true,
    });
  } catch (error) {
    console.error('NSFW inference failed:', error);
    process.exitCode = 1;
  }
}

main();