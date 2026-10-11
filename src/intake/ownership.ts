// Stage 1c: the ownership gate. Without it, a discovery engine is a stalking tool.
//
// Two tiers:
//  * Declaration only  -> exact/near-duplicate/similar search is allowed (it finds copies of THAT
//                         picture; it cannot find other pictures of a person).
//  * Declaration + selfie that matches the upload's face -> face-level features are unlocked
//                         (deepfake region analysis). A selfie of the same person is the minimum
//                         proof that the requester is the person shown.
// PRODUCTION NOTE: a still selfie can be spoofed with a photo of the victim. Use liveness
// detection (active/passive) before trusting `faceVerified`.
import { SearchQuery } from '../types';
import { config } from '../config';
import { cosine } from '../util/math';
import { normalize } from '../util/image';
import { detectLargestFace, faceEmbedding, faceModelsAvailable } from '../fingerprint/face';
import { IntakeError } from './validate';

export interface OwnershipResult {
  declared: boolean;
  faceVerified: boolean;
  selfieSimilarity?: number;
  warnings: string[];
}

export async function verifyOwnership(q: SearchQuery): Promise<OwnershipResult> {
  if (!q.declaration.isOwnerOrAuthorized)
    throw new IntakeError('no_declaration', 'Search refused: you must confirm the image shows you (or that you are authorised to act for the person shown).');

  const res: OwnershipResult = { declared: true, faceVerified: false, warnings: [] };
  if (!q.selfieBuffer) {
    res.warnings.push('No selfie supplied: face-level / deepfake region analysis is disabled.');
    return res;
  }
  if (!faceModelsAvailable()) {
    res.warnings.push('Face models not installed (npm run models): cannot verify selfie, face analysis disabled.');
    return res;
  }

  const [imgN, selfN] = await Promise.all([normalize(q.imageBuffer), normalize(q.selfieBuffer)]);
  const [fa, fb] = await Promise.all([detectLargestFace(imgN), detectLargestFace(selfN)]);
  if (!fa || !fb) {
    res.warnings.push('Could not find a face in the upload and/or the selfie: face analysis disabled.');
    return res;
  }
  const [ea, eb] = await Promise.all([faceEmbedding(imgN, fa), faceEmbedding(selfN, fb)]);
  res.selfieSimilarity = cosine(ea, eb);
  res.faceVerified = res.selfieSimilarity >= config.thresholds.ownerFaceMatch;
  if (!res.faceVerified)
    res.warnings.push(`Selfie does not match the face in the upload (similarity ${res.selfieSimilarity.toFixed(2)} < ${config.thresholds.ownerFaceMatch}): face analysis disabled.`);
  return res;
}
