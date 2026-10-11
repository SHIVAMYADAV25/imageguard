// Box utilities shared by the face detectors.
import { FaceBox } from '../types';

export const iou = (a: FaceBox, b: FaceBox) => {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / (a.w * a.h + b.w * b.h - inter || 1);
};

/** Greedy non-maximum suppression: keep the best box, drop overlapping weaker ones. */
export function nms(boxes: FaceBox[], thr: number): FaceBox[] {
  const keep: FaceBox[] = [];
  for (const b of [...boxes].sort((p, q) => q.score - p.score)) if (keep.every((k) => iou(k, b) < thr)) keep.push(b);
  return keep;
}
