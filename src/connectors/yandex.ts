// Connector A2: Yandex reverse image search through SerpApi (engine=yandex_images&url=...).
// Yandex is notably strong at face-/person-level and non-English-web similarity, so it often
// surfaces pages that Google does not.   Docs: https://serpapi.com/yandex-images-api
import { Candidate } from '../types';
import { config } from '../config';
import { fetchJson } from '../util/http';
import { DiscoveryConnector } from './types';

export const yandex: DiscoveryConnector = {
  name: 'yandex',
  needsPublicUrl: true,
  enabled: () => !!config.keys.serpApi,

  async search(_q, _fp, ctx) {
    if (!ctx.imageUrl) return [];
    const url =
      'https://serpapi.com/search.json?engine=yandex_images' +
      `&url=${encodeURIComponent(ctx.imageUrl)}&api_key=${config.keys.serpApi}`;
    const json = await fetchJson(url);

    // SerpApi documents `image_results`; we also tolerate a few alternative keys.
    const rows: any[] = json.image_results ?? json.images_results ?? json.inline_images ?? [];
    const out: Candidate[] = [];
    for (const r of rows) {
      const pageUrl = r.link ?? r.source_url;
      if (!pageUrl || !/^https?:/i.test(pageUrl)) continue;
      out.push({
        pageUrl,
        imageUrl: r.original?.link ?? r.original ?? r.image,
        thumbnailUrl: r.thumbnail?.link ?? r.thumbnail,
        title: r.title,
        source: 'yandex',
      });
    }
    return out;
  },
};
