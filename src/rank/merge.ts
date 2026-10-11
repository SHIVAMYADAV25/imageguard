// Stage 3b / 5: dedupe and order. The same page often arrives from 3 providers with slightly
// different URLs (tracking params, www., trailing slash, #fragment). We canonicalize, merge, and
// remember WHICH connectors found it (foundBy) because agreement between providers is evidence.
import { Candidate, MatchResult } from '../types';

const TRACKING = /^(utm_|fbclid|gclid|igshid|mc_|ref$|ref_src|s$|si$)/i;

export function canonicalUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = '';
    u.hostname = u.hostname.replace(/^www\./, '').replace(/^m\./, '').toLowerCase();
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    u.searchParams.sort();
    u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    return u.toString();
  } catch {
    return raw;
  }
}

/** Candidates identical in (page, image) collapse into one; their `source`s are concatenated. */
export function mergeCandidates(list: Candidate[]): Array<Candidate & { sources: string[] }> {
  const map = new Map<string, Candidate & { sources: string[] }>();
  for (const c of list) {
    const key = `${canonicalUrl(c.pageUrl)}|${c.imageUrl ? canonicalUrl(c.imageUrl) : ''}`;
    const hit = map.get(key);
    const incoming: string[] = (c as Candidate & { sources?: string[] }).sources ?? [c.source];
    if (!hit) {
      map.set(key, { ...c, sources: [...incoming] });
    } else {
      for (const s of incoming) if (!hit.sources.includes(s)) hit.sources.push(s);
      hit.thumbnailUrl ??= c.thumbnailUrl;
      hit.imageUrl ??= c.imageUrl;
      hit.inlineImage ??= c.inlineImage;
    }
  }
  return [...map.values()];
}

const TYPE_RANK: Record<string, number> = { exact: 0, possible_deepfake: 1, near_duplicate: 2, similar: 3 };

/** One result per canonical page URL (best score wins, foundBy unions), sorted for the user. */
export function mergeResults(results: MatchResult[]): MatchResult[] {
  const byPage = new Map<string, MatchResult>();
  for (const r of results) {
    const key = canonicalUrl(r.pageUrl);
    const prev = byPage.get(key);
    if (!prev) byPage.set(key, r);
    else {
      const best = r.score > prev.score ? r : prev;
      best.foundBy = [...new Set([...prev.foundBy, ...r.foundBy])];
      byPage.set(key, best);
    }
  }
  return [...byPage.values()].sort(
    (a, b) => TYPE_RANK[a.matchType] - TYPE_RANK[b.matchType] || b.score - a.score,
  );
}
