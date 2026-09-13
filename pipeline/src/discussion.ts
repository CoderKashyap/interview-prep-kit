import { fetchPage, sleep } from "./fetchPage.js";
import { resolveLink } from "./urls.js";

export interface DiscussionResult {
  found: boolean;
  snippets: string[];
  sources: string[];
  skipped: Array<{ url: string; reason: string }>;
}

function companyNameFromUrl(companyUrl: string): string {
  try {
    const host = new URL(companyUrl).hostname.replace(/^www\./, "");
    return host.split(".")[0];
  } catch {
    return companyUrl;
  }
}

export async function findPublicDiscussion(
  companyUrl: string,
  companyName: string,
  options: { allowPrivate: boolean },
): Promise<DiscussionResult> {
  const name = companyName || companyNameFromUrl(companyUrl);
  const query = `"${name}" interview process OR hiring process -site:${new URL(companyUrl).hostname}`;
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  const result: DiscussionResult = { found: false, snippets: [], sources: [], skipped: [] };
  const page = await fetchPage(searchUrl, { allowPrivate: options.allowPrivate });

  if (page.skipped) {
    result.skipped.push({ url: searchUrl, reason: page.skipped });
    return result;
  }

  const hrefs = page.links
    .map((href) => {
      if (href.includes("uddg=")) {
        try {
          const url = new URL(href, searchUrl);
          return url.searchParams.get("uddg");
        } catch {
          return null;
        }
      }
      return resolveLink(searchUrl, href);
    })
    .filter((href): href is string => Boolean(href))
    .filter((href) => /^https?:/i.test(href))
    .filter((href) => !/duckduckgo\.com|google\.com|bing\.com/i.test(href));

  const unique = [...new Set(hrefs)].slice(0, 3);
  for (const url of unique) {
    await sleep(400);
    const article = await fetchPage(url, { allowPrivate: options.allowPrivate });
    if (article.skipped) {
      result.skipped.push({ url, reason: article.skipped });
      continue;
    }
    if (article.text.length < 80) continue;
    result.found = true;
    result.sources.push(article.url);
    result.snippets.push(article.text.slice(0, 1800));
  }

  if (!result.found && page.text.length > 80) {
    result.snippets.push(page.text.slice(0, 1200));
    result.sources.push(searchUrl);
    result.found = /interview|hiring|onsite|take-home/i.test(page.text);
  }

  return result;
}
