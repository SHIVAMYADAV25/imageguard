import { Candidate, Fingerprint, SearchQuery } from '../types';

export interface DiscoveryContext {
  /** A public URL of the query image (temp-hosted or user supplied). Undefined if unavailable. */
  imageUrl?: string;
}

/** Every discovery source implements this one interface and is run in parallel with a timeout. */
export interface DiscoveryConnector {
  name: string;
  /** true => needs ctx.imageUrl (the provider fetches the image itself). */
  needsPublicUrl: boolean;
  /** false => skipped (e.g. missing API key). */
  enabled(): boolean;
  search(q: SearchQuery, fp: Fingerprint, ctx: DiscoveryContext): Promise<Candidate[]>;
}
