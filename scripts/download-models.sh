#!/usr/bin/env bash
# Downloads the ONNX models. Usage: bash scripts/download-models.sh [clip|face|nsfw|all]
# Every model is optional: the engine degrades gracefully (see README "Models").
set -uo pipefail   # no -e: one failed model must not stop the others
cd "$(dirname "$0")/../models"
what="${1:-all}"

dl() { # url, outfile  (refuses to keep an HTML error page masquerading as a model)
  if [ -f "$2" ]; then echo "have $2"; return; fi
  echo "downloading $2"
  curl -fL --retry 3 -o "$2.tmp" "$1" || { rm -f "$2.tmp"; echo "FAILED: $1"; return 1; }
  if head -c 64 "$2.tmp" | grep -qi "<!doctype\|<html"; then
    rm -f "$2.tmp"; echo "FAILED: $1 returned an HTML page, not a model. Download it manually into models/$2"; return 1
  fi
  mv "$2.tmp" "$2"
}

if [[ "$what" == "clip" || "$what" == "all" ]]; then
  # CLIP ViT-B/32 vision tower with projection head (Xenova export). ~350 MB (or use the _quantized file).
  dl "https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/main/onnx/vision_model.onnx" clip_vision.onnx
fi
if [[ "$what" == "face" || "$what" == "all" ]]; then
  # UltraFace RFB-640 face detector (~1.5 MB): fallback detector, boxes only
  dl "https://raw.githubusercontent.com/Linzaer/Ultra-Light-Fast-Generic-Face-Detector-1MB/master/models/onnx/version-RFB-640.onnx" face_detector.onnx
  # InsightFace buffalo_l pack (~280 MB zip): we keep two files from it:
  #   det_10g.onnx   -> scrfd.onnx   (SCRFD detector with 5 landmarks => aligned faces, the BEST detector here)
  #   w600k_r50.onnx -> arcface.onnx (ArcFace recognition model)
  if [ ! -f arcface.onnx ] || [ ! -f scrfd.onnx ]; then
    dl "https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip" buffalo_l.zip && {
      unzip -o -j buffalo_l.zip w600k_r50.onnx det_10g.onnx -d . \
        && mv -f w600k_r50.onnx arcface.onnx && mv -f det_10g.onnx scrfd.onnx && rm -f buffalo_l.zip
    }
  fi
fi
if [[ "$what" == "nsfw" || "$what" == "all" ]]; then
  # NudeNet v3 detector, 320px (~12 MB)
  dl "https://github.com/notAI-tech/NudeNet/releases/download/v3.4-weights/320n.onnx" nsfw_nudenet.onnx
fi
echo "Done. Present models:"; ls -lh *.onnx 2>/dev/null || true
echo "Optional (bring your own): deepfake_detector.onnx  (see src/verify/deepfake.ts)"
