// robots.txt compliance. The crawler REFUSES any URL that robots.txt disallows for our user-agent
// and honours Crawl-delay. Policy when robots.txt cannot be read:
//   4xx (no file)      -> allowed (the standard interpretation)
//   5xx / network error -> NOT allowed (fail closed: if we cannot tell, we do not crawl)
import robotsParser from 'robots-parser';
import { safeFetch } from '../util/http';

const UA_TOKEN = 'ImageGuardBot';
type Robots = ReturnType<typeof robotsParser>;
const cache = new Map<string, Promise<{ robots: Robots | null; allowAll: boolean }>>();

async function load(origin: string) {
  try {
    const r = await safeFetch(`${origin}/robots.txt`, { maxBytes: 500_000, timeoutMs: 8000, allowedTypes: /text|octet-stream|^$/i });
    return { robots: robotsParser(`${origin}/robots.txt`, r.buffer.toString('utf8')), allowAll: false };
  } catch (e) {
    if (/HTTP 4\d\d/.test((e as Error).message)) return { robots: null, allowAll: true };
    return { robots: null, allowAll: false }; // fail closed
  }
}

export async function isAllowed(url: string): Promise<boolean> {
  const origin = new URL(url).origin;
  if (!cache.has(origin)) cache.set(origin, load(origin));
  const { robots, allowAll } = await cache.get(origin)!;
  if (allowAll) return true;
  return robots ? robots.isAllowed(url, UA_TOKEN) !== false : false;
}

/** Crawl-delay in ms declared by the site (if any). */
export async function crawlDelayMs(url: string): Promise<number | undefined> {
  const origin = new URL(url).origin;
  if (!cache.has(origin)) cache.set(origin, load(origin));
  const { robots } = await cache.get(origin)!;
  const d = robots?.getCrawlDelay(UA_TOKEN);
  return d ? d * 1000 : undefined;
}
