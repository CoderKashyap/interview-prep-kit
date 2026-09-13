import { fetchPage, sleep, type FetchedPage } from "./fetchPage.js";
import { parseRobots } from "./robots.js";
import { isInCrawlScope, resolveLink, urlKey } from "./urls.js";
import type { ResearchNotes } from "./types.js";

const HIRING_PATTERNS = [
  /career/i,
  /job/i,
  /hiring/i,
  /join.?us/i,
  /work.?with/i,
  /handbook/i,
  /interview/i,
  /how.?we.?hire/i,
  /recruit/i,
  /openings/i,
  /talent/i,
];

const ABOUT_PATTERNS = [
  /about/i,
  /company/i,
  /mission/i,
  /value/i,
  /culture/i,
  /engineering/i,
  /team/i,
  /what.?we.?do/i,
  /product/i,
  /story/i,
];

const MAX_PAGES = 10;
const MAX_DEPTH = 2;

export interface CrawlResult {
  pages: FetchedPage[];
  notes: Pick<ResearchNotes, "skipped_sources" | "hiring_page_found" | "pages_considered">;
}

export function looksLikeHiringPage(url: string, title = "", snippet = ""): boolean {
  return HIRING_PATTERNS.some((pattern) => pattern.test(`${url} ${title} ${snippet}`));
}

export function scoreLink(url: string, anchorText = ""): number {
  const haystack = `${url} ${anchorText}`;
  let score = 0;
  for (const pattern of HIRING_PATTERNS) {
    if (pattern.test(haystack)) score += 8;
  }
  for (const pattern of ABOUT_PATTERNS) {
    if (pattern.test(haystack)) score += 5;
  }
  try {
    const parsed = new URL(url);
    if (/jobs?|careers?|handbook|hiring/i.test(parsed.pathname)) score += 10;
  } catch {
    /* ignore */
  }
  if (/blog|news|press|legal|privacy|login|signup|cart|pricing/i.test(url)) score -= 4;
  if (looksLikeAssetOrAccountUrl(url)) score -= 20;
  return score;
}

export function looksLikeAssetOrAccountUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (/\.(yml|yaml|json|xml|md|pdf|zip|png|jpe?g|gif|svg|css|js)$/i.test(parsed.pathname)) return true;
    return /\/blob\/|\/raw\/|\/tree\/|registrations?|sign-?up|sign-?in|login/i.test(parsed.pathname);
  } catch {
    return true;
  }
}

async function loadRobots(origin: string, allowPrivate: boolean) {
  const robotsUrl = new URL("/robots.txt", origin).toString();
  const page = await fetchPage(robotsUrl, { allowPrivate });
  if (page.skipped) return null;
  try {
    return parseRobots(page.text);
  } catch {
    return null;
  }
}

interface FrontierItem {
  url: string;
  score: number;
  depth: number;
}

export async function crawlCompanySite(
  companyUrl: string,
  options: { allowPrivate: boolean },
): Promise<CrawlResult> {
  const notes: CrawlResult["notes"] = {
    skipped_sources: [],
    hiring_page_found: false,
    pages_considered: [],
  };

  const home = await fetchPage(companyUrl, { allowPrivate: options.allowPrivate });
  if (home.skipped) {
    notes.skipped_sources.push({ url: companyUrl, reason: home.skipped });
    return { pages: [], notes };
  }

  notes.pages_considered.push(home.url);
  if (looksLikeHiringPage(home.url, home.title, home.text.slice(0, 400))) {
    notes.hiring_page_found = true;
  }

  const robotsCache = new Map<string, Awaited<ReturnType<typeof loadRobots>> | undefined>();
  async function allowed(url: string): Promise<boolean> {
    const origin = new URL(url).origin;
    if (!robotsCache.has(origin)) {
      robotsCache.set(origin, await loadRobots(`${origin}/`, options.allowPrivate));
    }
    const robots = robotsCache.get(origin);
    return !robots || robots.isAllowed(url);
  }

  const seen = new Set<string>([urlKey(home.url)]);
  const pages: FetchedPage[] = [home];
  const frontier: FrontierItem[] = [];

  function enqueue(from: FetchedPage, depth: number): void {
    for (const href of from.links) {
      const absolute = resolveLink(from.url, href);
      if (!absolute || !isInCrawlScope(absolute, companyUrl) || looksLikeAssetOrAccountUrl(absolute)) continue;
      const key = urlKey(absolute);
      if (seen.has(key)) continue;
      const score = scoreLink(absolute, href);
      if (score <= 0) continue;
      frontier.push({ url: absolute, score, depth });
    }
  }

  enqueue(home, 1);

  while (pages.length < MAX_PAGES) {
    frontier.sort((a, b) => b.score - a.score);
    const next = frontier.find((item) => !seen.has(urlKey(item.url)) && item.depth <= MAX_DEPTH);
    if (!next) break;
    seen.add(urlKey(next.url));

    if (!(await allowed(next.url))) {
      notes.skipped_sources.push({ url: next.url, reason: "blocked by robots.txt" });
      continue;
    }

    await sleep(300);
    const page = await fetchPage(next.url, { allowPrivate: options.allowPrivate, referrer: home.url });
    notes.pages_considered.push(next.url);
    if (page.skipped) {
      notes.skipped_sources.push({ url: next.url, reason: page.skipped });
      continue;
    }

    pages.push(page);
    if (looksLikeHiringPage(page.url, page.title, page.text.slice(0, 400))) {
      notes.hiring_page_found = true;
    }
    if (next.depth < MAX_DEPTH) {
      enqueue(page, next.depth + 1);
    }
  }

  return { pages, notes };
}

export function pagesToContext(pages: FetchedPage[], limit = 9000): string {
  const chunks = pages
    .filter((page) => page.text)
    .map((page) => `URL: ${page.url}\nTITLE: ${page.title}\nTEXT: ${page.text.slice(0, 2500)}`);
  return chunks.join("\n\n---\n\n").slice(0, limit);
}
