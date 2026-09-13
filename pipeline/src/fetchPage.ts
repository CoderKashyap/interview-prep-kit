import * as cheerio from "cheerio";
import { assertSafeUrl } from "./urls.js";

const MAX_BYTES = 1_500_000;
const FETCH_TIMEOUT_MS = 12_000;
const ALLOWED_TYPES = ["text/html", "application/xhtml+xml", "text/plain"];

export interface FetchedPage {
  url: string;
  title: string;
  text: string;
  links: string[];
  contentType: string;
  skipped?: string;
}

export async function fetchPage(
  rawUrl: string,
  options: { allowPrivate: boolean; referrer?: string },
): Promise<FetchedPage> {
  const url = await assertSafeUrl(rawUrl, options.allowPrivate);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "InterviewPrepKitBot/1.0 (+https://github.com/trao-assessment)",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
        ...(options.referrer ? { Referer: options.referrer } : {}),
      },
    });

    if (!response.ok) {
      return {
        url: response.url || url.toString(),
        title: "",
        text: "",
        links: [],
        contentType: "",
        skipped: `HTTP ${response.status}`,
      };
    }

    const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (contentType && !ALLOWED_TYPES.some((type) => contentType.startsWith(type))) {
      return {
        url: response.url || url.toString(),
        title: "",
        text: "",
        links: [],
        contentType,
        skipped: `unsupported content type ${contentType}`,
      };
    }

    const length = Number(response.headers.get("content-length") ?? "0");
    if (length > MAX_BYTES) {
      return {
        url: response.url || url.toString(),
        title: "",
        text: "",
        links: [],
        contentType,
        skipped: "response too large",
      };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_BYTES) {
      return {
        url: response.url || url.toString(),
        title: "",
        text: "",
        links: [],
        contentType,
        skipped: "response too large",
      };
    }

    const html = buffer.toString("utf8");
    return cleanPage(response.url || url.toString(), html, contentType);
  } catch (error) {
    const message = error instanceof Error ? error.message : "fetch failed";
    return {
      url: url.toString(),
      title: "",
      text: "",
      links: [],
      contentType: "",
      skipped: message.includes("abort") ? "timeout" : message,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function cleanPage(url: string, html: string, contentType = "text/html"): FetchedPage {
  if (contentType.startsWith("text/plain")) {
    return { url, title: "", text: html.slice(0, 20_000), links: [], contentType };
  }

  const $ = cheerio.load(html);
  const links: string[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (href) links.push(href);
  });

  $("script, style, noscript, svg, iframe, form, nav, header, footer, aside").remove();

  const title = $("title").first().text().trim() || $("h1").first().text().trim();
  const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, 20_000);

  return { url, title, text, links, contentType };
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
