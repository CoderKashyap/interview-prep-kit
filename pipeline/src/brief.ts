import type { FetchedPage } from "./fetchPage.js";

const CHROME_NOISE = /log ?in|sign ?in|password|cookie|privacy|register|subscribe/i;
const MARKETING_CTA =
  /register now|try for free|learn more|get started|what'?s new|join the \d+|start (a )?free trial/i;
const SENTENCE_VERB =
  /\b(is|are|was|were|has|have|helps?|lets?|use|uses|used|build|built|provide|provides|enable|enables|deliver|delivers|make|makes|do|does|can|will)|(?:^|\s)we(?:'re| are)\b/i;

const PROSE_START =
  /\b(What we do|Who we are|About us|We(?:'re| are)|What started|Since (?:the|our)\b|[A-Z][A-Za-z0-9.+-]{2,} is )\b/;

function dropLeadingChips(text: string): string {
  const match = text.match(PROSE_START);
  if (!match || match.index == null) return text;
  let rest = text.slice(match.index);
  rest = rest.replace(/^(What we do|Who we are|About us)\s+/i, "");
  return rest.trim() || text;
}

function stripChipPrefix(sentence: string): string {
  const cut = sentence.search(PROSE_START);
  if (cut > 24) return sentence.slice(cut).replace(/^(What we do|Who we are|About us)\s+/i, "");
  return sentence;
}

function proseFromText(text: string): string {
  const cleaned = dropLeadingChips(text.replace(/\s+/g, " ").trim());
  const parts = cleaned.split(/(?<=[.!])\s+/).map(stripChipPrefix).filter((sentence) => {
    if (sentence.length < 50) return false;
    if (looksLikeNavDump(sentence)) return false;
    if (MARKETING_CTA.test(sentence)) return false;
    if (CHROME_NOISE.test(sentence) && sentence.length < 120) return false;
    if (!SENTENCE_VERB.test(sentence)) return false;
    return true;
  });
  const joined = parts.slice(0, 4).join(" ").slice(0, 700);
  return looksLikeNavDump(joined) ? "" : joined;
}

function pagePath(url: string): string {
  try {
    return new URL(url).pathname.replace(/\/+$/, "") || "/";
  } catch {
    return "/";
  }
}

function pageScore(page: FetchedPage): number {
  const path = pagePath(page.url);
  let score = 0;
  if (/\/(about|company|handbook|mission|who-we-are)\b/i.test(path)) score += 16;
  if (path === "/") score -= 8;
  if (/\/(jobs?|careers?|login|pricing|signup|contact|solutions)\b/i.test(path)) score -= 6;
  if (looksLikeNavDump(page.text.slice(0, 800))) score -= 12;
  if (proseFromText(page.text).length > 80) score += 10;
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
  const ctas = trimmed.match(new RegExp(MARKETING_CTA.source, "gi")) ?? [];
  if (ctas.length >= 2) return true;
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
