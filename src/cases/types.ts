// Case tracking data model. A case stores FINGERPRINTS and METADATA only: never the image itself.
import { HashPackage } from '../hashing/pdq';
import { MatchType, NsfwLabel } from '../types';

export type Jurisdiction = 'IN' | 'US' | 'UK' | 'OTHER';
export type UrlStatus = 'discovered' | 'verified' | 'reported' | 'removed' | 'rejected' | 'unreachable';

export interface StoredFingerprint {
  sha256: string; phash: string; phashFlipped: string;
  embedding: string; embeddingFlipped: string; // base64 Float32Array
  embedderName: string;
}

export interface ReportRecord {
  id: string;
  channel: string;                 // e.g. "Pornhub trust & safety", "Grievance Officer", "Google removal form"
  basis: string[];                 // legal / policy basis cited
  submittedAt: string;
  reference?: string;              // ticket / acknowledgement number from the platform
  deadlineAt?: string;             // statutory clock, where one applies
  response?: { at: string; outcome: 'removed' | 'rejected' | 'no_response' | 'info_requested'; note?: string };
}

export interface CaseUrl {
  id: string;
  url: string;
  addedAt: string;
  status: UrlStatus;
  verification?: { checkedAt: string; domain: string; matchType: MatchType; score: number; reasons: string[]; nsfw: NsfwLabel; imageUrl?: string };
  reports: ReportRecord[];
  lastCheck?: { at: string; note: string };
}

/** Tamper-evident ledger: each event commits to the previous one (a hash chain). */
export interface LedgerEvent { seq: number; at: string; type: string; data: unknown; prevHash: string; hash: string }

export interface CaseFile {
  schema: 'imageguard.case/1';
  id: string;
  title: string;
  jurisdiction: Jurisdiction;
  createdAt: string;
  fingerprint: StoredFingerprint;
  hashPackage: HashPackage;
  urls: CaseUrl[];
  events: LedgerEvent[];
}

/** Statutory removal clocks (hours) for covered intermediaries. Platforms may dispute coverage. */
export const DEADLINE_HOURS: Partial<Record<Jurisdiction, number>> = { IN: 24, US: 48 };
