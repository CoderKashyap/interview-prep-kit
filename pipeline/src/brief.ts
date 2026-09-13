import type { FetchedPage } from "./fetchPage.js";

const NAV_NOISE =
  /log ?in|sign ?in|password|cookie|close to search|duo agent|suggestions gitlab|register|privacy/i;

function proseFromText(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const parts = cleaned.split(/(?<=[.!?])\s+/).filter((sentence) => {
    if (sentence.length < 50) return false;
    if (NAV_NOISE.test(sentence)) return false;
    return true;
  });
  return parts.slice(0, 4).join(" ").slice(0, 700);
}

function pageScore(page: FetchedPage): number {
  const haystack = `${page.url} ${page.title}`;
  let score = Math.min(page.text.length / 200, 8);
  if (/about|company|handbook|mission|what-we/i.test(haystack)) score += 12;
  if (/jobs|login|careers|pricing|signup/i.test(haystack)) score -= 5;
  return score;
}

export function looksLikeNavDump(text: string): boolean {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length < 40) return true;
  if (NAV_NOISE.test(trimmed) && !(trimmed.match(/[.!?]/g) ?? []).length) return true;
  const sentences = (trimmed.match(/[.!?]/g) ?? []).length;
  return sentences === 0 && trimmed.split(/\s+/).length > 12;
}

export function briefFromPages(
  pages: FetchedPage[],
  companyUrl: string,
  companyName: string,
): { summary: string; what_they_do: string; sources: string[] } {
  const ranked = [...pages].sort((a, b) => pageScore(b) - pageScore(a));
  const prose = ranked.map((page) => proseFromText(page.text)).find((text) => text.length > 80) ?? "";
  const name = companyName || (() => {
    try {
      return new URL(companyUrl).hostname.replace(/^www\./, "");
    } catch {
      return companyUrl;
    }
  })();
  const hiring = pages.some((page) => /jobs|careers|hiring|handbook/i.test(`${page.url} ${page.title}`));

  return {
    summary: `${name} was researched from ${pages.length} retrieved page(s) starting at ${companyUrl}. ${
      hiring ? "A hiring or handbook page was among them." : "No dedicated hiring page stood out in the crawl."
    } This brief is taken only from those pages.`,
    what_they_do:
      prose ||
      `The retrieved pages at ${companyUrl} did not include a clear product paragraph after navigation text was removed. See sources.`,
    sources: pages.map((page) => page.url).filter(Boolean),
  };
}
