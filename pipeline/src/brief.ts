import type { FetchedPage } from "./fetchPage.js";

const CHROME_NOISE = /log ?in|sign ?in|password|cookie|privacy|register|subscribe/i;
const SENTENCE_VERB =
  /\b(is|are|was|were|has|have|helps?|lets?|use|uses|used|build|built|provide|provides|enable|enables|deliver|delivers|make|makes|do|does|can|will)\b/i;

function proseFromText(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const parts = cleaned.split(/(?<=[.!])\s+/).filter((sentence) => {
    if (sentence.length < 50) return false;
    if (looksLikeNavDump(sentence)) return false;
    if (CHROME_NOISE.test(sentence) && sentence.length < 120) return false;
    if (!SENTENCE_VERB.test(sentence)) return false;
    return true;
  });
  const joined = parts.slice(0, 4).join(" ").slice(0, 700);
  return looksLikeNavDump(joined) ? "" : joined;
}

function pageScore(page: FetchedPage): number {
  const haystack = `${page.url} ${page.title}`;
  let score = Math.min(page.text.length / 200, 8);
  if (/about|company|handbook|mission/i.test(haystack)) score += 12;
  if (/login|pricing|signup|jobs|careers/i.test(haystack)) score -= 5;
  if (looksLikeNavDump(page.text.slice(0, 500))) score -= 10;
  return score;
}

export function looksLikeNavDump(text: string): boolean {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length < 40) return true;
  const words = trimmed.split(/\s+/).filter(Boolean);
  const periods = (trimmed.match(/[.!]/g) ?? []).length;
  const questions = (trimmed.match(/\?/g) ?? []).length;
  if (CHROME_NOISE.test(trimmed) && periods === 0) return true;
  if (periods === 0 && words.length > 12) return true;
  if (questions >= 2 && periods < 2) return true;
  const listMarks = (trimmed.match(/&|\//g) ?? []).length;
  if (listMarks >= 6 && periods < 3) return true;
  const titleish = words.filter((word) => /^[A-Z][A-Za-z0-9+-]*$/.test(word.replace(/[.,:;!?]+$/, ""))).length;
  if (words.length > 20 && titleish / words.length > 0.5 && periods < 3) return true;
  return false;
}

export function briefFromPages(
  pages: FetchedPage[],
  companyUrl: string,
  companyName: string,
): { summary: string; what_they_do: string; sources: string[] } {
  const ranked = [...pages].sort((a, b) => pageScore(b) - pageScore(a));
  const prose =
    ranked.map((page) => proseFromText(page.text)).find((text) => text.length > 80 && !looksLikeNavDump(text)) ?? "";
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
