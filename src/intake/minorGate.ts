// Stage 1b: the minor gate. If the person shown may be under 18 we do NOT search; we point the
// user to the specialist services built for exactly this situation.
//
// HONEST STATUS: no age-estimation model is bundled. Today the gate relies on the user's
// attestation (isAdult). An age estimator can be plugged in with `registerAgeEstimator`; if it
// returns an age below ADULT_MARGIN the search is refused. A real deployment MUST add one.
import { Declaration } from '../types';
import { IntakeError } from './validate';

export type AgeEstimator = (img: Buffer) => Promise<number | null>;
let estimator: AgeEstimator | null = null;
export const registerAgeEstimator = (fn: AgeEstimator) => { estimator = fn; };

const ADULT_MARGIN = 21; // refuse if estimated age < 21: estimators are noisy, so we leave a safety margin
export const MINOR_REFERRAL =
  'If the person in the image is under 18, do not use this tool. Use NCMEC Take It Down (https://takeitdown.ncmec.org/) or the IWF Report Remove tool (https://report.iwf.org.uk/) instead.';

export async function minorGate(decl: Declaration, img: Buffer): Promise<{ warnings: string[] }> {
  if (!decl.isAdult) throw new IntakeError('minor_or_unconfirmed', 'Search refused: adult status not confirmed.', MINOR_REFERRAL);
  if (!estimator) return { warnings: ['No age estimator registered: relying on user attestation only (not production-safe).'] };
  const age = await estimator(img);
  if (age !== null && age < ADULT_MARGIN)
    throw new IntakeError('possible_minor', 'Search refused: the image may show a minor.', MINOR_REFERRAL);
  return { warnings: [] };
}
