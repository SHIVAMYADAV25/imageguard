// Stage 5 helper: "where do I report this?" Static lookup keyed by domain (suffix match).
import registry from './domains.json';

export interface ReportInfo { name: string; reportUrl?: string; notes?: string }

export function lookupReport(domain: string): ReportInfo {
  const d = domain.toLowerCase();
  for (const e of registry.entries as Array<{ domains: string[]; name: string; reportUrl?: string; notes?: string }>) {
    if (e.domains.some((x) => d === x || d.endsWith('.' + x))) return { name: e.name, reportUrl: e.reportUrl, notes: e.notes };
  }
  return { ...registry.fallback, name: `${registry.fallback.name} (${domain})` };
}

/** Always-relevant resources shown with every report. */
export const GLOBAL_RESOURCES = [
  { name: 'StopNCII.org', url: 'https://stopncii.org/', use: 'Hash your intimate image on-device so participating platforms block it proactively.' },
  { name: 'NCMEC Take It Down', url: 'https://takeitdown.ncmec.org/', use: 'If the image was taken when you were under 18.' },
  { name: 'Google: remove involuntary explicit imagery', url: 'https://support.google.com/websearch/answer/9116649', use: 'De-list URLs from Google Search.' },
];
