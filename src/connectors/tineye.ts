// Connector A3: TinEye commercial API. Best at EXACT and near-exact copies (crops, resizes,
// recompression) and reports the real page + image URL for each backlink. Accepts a direct
// upload, so it is the only reverse-image connector that works WITHOUT a public image URL.
// NOTE: the auth header below follows TinEye's "header instead of signature" scheme (2021 release
// notes). If your key type differs, check https://services.tineye.com/developers/tineyeapi/ .
import { Candidate } from '../types';
import { config } from '../config';
import { fetchJson } from '../util/http';
import { DiscoveryConnector } from './types';

export const tineye: DiscoveryConnector = {
  name: 'tineye',
  needsPublicUrl: false,
  enabled: () => !!config.keys.tineye,

  async search(_q, fp) {
    const form = new FormData();
    form.append('image_upload', new Blob([new Uint8Array(fp.normalizedImage)], { type: 'image/jpeg' }), 'query.jpg');
    const json = await fetchJson('https://api.tineye.com/rest/search/', {
      method: 'POST',
      headers: { 'x-api-key': config.keys.tineye },
      body: form,
    });

    const matches: any[] = json.results?.matches ?? json.matches ?? [];
    const out: Candidate[] = [];
    for (const m of matches) {
      for (const b of m.backlinks ?? []) {
        if (!b.backlink) continue;
        out.push({
          pageUrl: b.backlink,          // the page that embeds the image
          imageUrl: b.url,              // the image file on that page
          thumbnailUrl: m.image_url,    // TinEye's stored copy (fallback)
          source: 'tineye',
          providerScore: typeof m.score === 'number' ? m.score / 100 : undefined,
        });
      }
    }
    return out;
  },
};
