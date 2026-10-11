// PLATFORM SIDE: what a platform does with every incoming upload.
//   1. hash it (PDQ-style, all orientations)  2. compare to the victim-submitted blocklist
//   3. classify it (NSFW) for routing         4. decide: block / review / allow
// Matches are HELD for human review rather than silently deleted, mirroring StopNCII's model
// ("sent for moderation and removed if it meets the platform's policy").
import { NsfwLabel } from '../types';
import { classifyNsfw } from '../verify/nsfw';
import { normalize } from '../util/image';
import { pdq, PDQ_MATCH_THRESHOLD, PDQ_MIN_QUALITY } from '../hashing/pdq';
import { HashBlocklist } from './blocklist';

export interface ModerationDecision {
  action: 'block' | 'review' | 'allow';
  reasons: string[];
  nsfw: NsfwLabel;
  quality: number;
  match?: { entryId: string; caseRef?: string; distance: number };
}

const REVIEW_BAND = 12; // distances just above the match threshold go to a human instead of being ignored

export async function checkUpload(img: Buffer, list: HashBlocklist): Promise<ModerationDecision> {
  const norm = await normalize(img, 1024);
  const [h, nsfw] = await Promise.all([pdq(norm), classifyNsfw(norm)]);
  const reasons: string[] = [];
  const closest = list.closest(h.dihedral);

  if (closest && closest.distance <= PDQ_MATCH_THRESHOLD) {
    const m = { entryId: closest.entry.id, caseRef: closest.entry.caseRef, distance: closest.distance };
    if (h.quality < PDQ_MIN_QUALITY) {
      reasons.push(`hash is close (distance ${m.distance}) but image quality ${h.quality} < ${PDQ_MIN_QUALITY}: hash unreliable, route to human review`);
      return { action: 'review', reasons, nsfw, quality: h.quality, match: m };
    }
    reasons.push(`matches a victim-submitted hash (distance ${m.distance} <= ${PDQ_MATCH_THRESHOLD}); hold upload and remove if it violates intimate-image-abuse policy`);
    return { action: 'block', reasons, nsfw, quality: h.quality, match: m };
  }
  if (closest && closest.distance <= PDQ_MATCH_THRESHOLD + REVIEW_BAND) {
    reasons.push(`near-miss (distance ${closest.distance}): possibly an edited copy, route to human review`);
    return { action: 'review', reasons, nsfw, quality: h.quality, match: { entryId: closest.entry.id, caseRef: closest.entry.caseRef, distance: closest.distance } };
  }
  reasons.push(closest ? `no match (closest distance ${closest.distance})` : 'blocklist empty');
  if (nsfw === 'explicit') reasons.push('classified explicit: apply the platform adult-content policy (age-gate / consent verification)');
  return { action: 'allow', reasons, nsfw, quality: h.quality };
}
