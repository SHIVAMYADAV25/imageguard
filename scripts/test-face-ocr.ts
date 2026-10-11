
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

import {
  faceModelsAvailable,
  detectFaces,
  detectLargestFace,
  faceEmbedding,
} from '../src/fingerprint/face';

import {
  runOcr,
  extractHandles,
} from '../src/fingerprint/ocr';

async function main() {
  const imagePath = process.argv[2];

  if (!imagePath || !fs.existsSync(imagePath)) {
    console.error(
      'Usage: npx tsx scripts/test-face-ocr.ts <image-path>'
    );
    process.exitCode = 1;
    return;
  }

  const img = fs.readFileSync(imagePath);
  const metadata = await sharp(img).metadata();

  console.log('\n=== IMAGE INFO ===');
  console.log({
    file: path.basename(imagePath),
    width: metadata.width,
    height: metadata.height,
    bytes: img.length,
  });

  console.log('\n=== FACE DETECTION ===');

  if (!faceModelsAvailable()) {
    console.log(
      'SKIPPED: face_detector.onnx or arcface.onnx is missing.'
    );
  } else {
    const faces = await detectFaces(img);
    console.log('Faces detected:', faces.length);
    console.log('Face boxes:', faces);

    const largest = await detectLargestFace(img);

    if (largest) {
      console.log('\n=== ARCFACE EMBEDDING ===');

      const embedding = await faceEmbedding(img, largest);

      console.log({
        dimensions: embedding.length,
        sampleValues: Array.from(embedding.slice(0, 5)),
        allFinite: Array.from(embedding).every(Number.isFinite),
      });

      if (embedding.length !== 512) {
        console.warn('Unexpected embedding length; expected 512.');
      }
    } else {
      console.log('ArcFace skipped: no face was detected.');
    }
  }

  console.log('\n=== OCR ===');

  const text = await runOcr(img);
  console.log('Extracted text:', text ?? '(no text extracted)');

  console.log('\n=== HANDLE EXTRACTION ===');

  const handles = extractHandles(text);
  console.log('Handles:', handles);

  console.log('\n=== TEST FINISHED ===');
}

main().catch((error) => {
  console.error('Test failed:', error);
  process.exitCode = 1;
});
