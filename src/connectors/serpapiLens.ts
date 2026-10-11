// Connector A1: Google Lens through SerpApi. The widest-coverage reverse-image source:
// returns pages containing the same or visually similar images, including pages on adult
// sites, forums and social platforms that Google has indexed.
// Docs: https://serpapi.com/google-lens-api   (billing: 1 credit per search)
import { Candidate } from '../types';
import { config } from '../config';
import { fetchJson } from '../util/http';
import { DiscoveryConnector } from './types';

export const serpapiLens: DiscoveryConnector = {
  name: 'google_lens',
  needsPublicUrl: true,
  enabled: () => !!config.keys.serpApi,

  async search(_q, _fp, ctx) {
    if (!ctx.imageUrl) return [];
    const url =
      'https://serpapi.com/search.json?engine=google_lens' +
      `&url=${encodeURIComponent(ctx.imageUrl)}&api_key=${config.keys.serpApi}`;
    const json = await fetchJson(url);

    const out: Candidate[] = [];
    // The response shape can vary by plan/version, so we read defensively: both arrays may exist.
    const take = (arr: any[] | undefined, providerScore: number) => {
      for (const m of arr ?? []) {
        if (!m?.link) continue;
        out.push({
          pageUrl: m.link,
          imageUrl: m.image,            // full-size image URL when Lens knows it
          thumbnailUrl: m.thumbnail,    // small Google-hosted preview (verification fallback)
          title: m.title,
          source: 'google_lens',
          providerScore,                // informational only: we recompute similarity ourselves
        });
      }
    };
    take(json.exact_matches, 0.9);
    take(json.visual_matches, 0.5);
    return out;
  },
};
