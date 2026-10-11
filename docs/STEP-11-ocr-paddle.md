# Step 11: Text reading: PaddleOCR (PP-OCRv4, ONNX) replaces tesseract

## Why
Screenshots, stylised watermarks and small UI text are where handles and source domains live. PP-OCRv4 is markedly stronger than tesseract on this material, and `@gutenye/ocr-node` ships the ONNX models **inside the npm package** (no downloads), running on the same `onnxruntime-node` as everything else.

## What was built
- `fingerprint/ocr.ts`: PaddleOCR with a confidence floor (0.6), automatic enlargement of small images (thin glyphs like `_` vanish otherwise), temp-file cleanup.
- `extractHandles`: tolerant to the most common OCR error (`_` read as a space): emits `priya_sharma92` *and* `priya`.
- `extractDomains`: watermark / site names (ignores file names and version strings).
- Pipeline report now includes **`hints: { handles, domains }`** (the source of an image is often printed on it) and handles feed the text-search connector. OCR is **on by default** (`ENABLE_OCR=0` to disable).

## Verified here (real model run)
Generated image with text → exact handle, watermark domain and name recognised (confidence 0.95–0.99, ~0.7 s warm). On the fake post screenshot: domain exact; handle recovered as `priya_sharma92` after the enlargement + joining fixes (first run had read it as `priya`: that is the bug these fixes address).

## Files
**Modified:** `src/fingerprint/ocr.ts` (rewritten), `src/fingerprint/index.ts` (OCR on a 2000 px render), `src/pipeline.ts` (hints), `src/config.ts` (OCR default on), `package.json` (+`@gutenye/ocr-node`, −`tesseract.js`)
