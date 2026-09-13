import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { PipelineError } from "./types.js";

const PRIVATE_RANGES: Array<[number, number]> = [
  [ipToInt("0.0.0.0"), ipToInt("0.255.255.255")],
  [ipToInt("10.0.0.0"), ipToInt("10.255.255.255")],
  [ipToInt("127.0.0.0"), ipToInt("127.255.255.255")],
  [ipToInt("169.254.0.0"), ipToInt("169.254.255.255")],
  [ipToInt("172.16.0.0"), ipToInt("172.31.255.255")],
  [ipToInt("192.168.0.0"), ipToInt("192.168.255.255")],
];

function ipToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

export function isPrivateIPv4(ip: string): boolean {
  if (isIP(ip) !== 4) return false;
  const value = ipToInt(ip);
  return PRIVATE_RANGES.some(([start, end]) => value >= start && value <= end);
}

export function parseHttpUrl(raw: string): URL {
  let value = raw.trim();
  if (!value) {
    throw new PipelineError("INVALID_URL", "Company URL is empty.");
  }
  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PipelineError("INVALID_URL", `Company URL is not valid: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new PipelineError("INVALID_URL", "Only http and https URLs are allowed.");
  }
  return url;
}

export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return host === "localhost" || host === "::1" || host.endsWith(".localhost");
}

export async function assertSafeUrl(raw: string, allowPrivate: boolean): Promise<URL> {
  const url = parseHttpUrl(raw);
  const host = url.hostname.replace(/^\[|\]$/g, "");

  if (allowPrivate) {
    return url;
  }

  if (isLoopbackHost(host) || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new PipelineError("BLOCKED_URL", "Private and loopback addresses are blocked in production.");
  }

  if (isIP(host) === 4 && isPrivateIPv4(host)) {
    throw new PipelineError("BLOCKED_URL", "Private IP addresses are blocked in production.");
  }

  if (isIP(host) === 6) {
    const lower = host.toLowerCase();
    if (lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80")) {
      throw new PipelineError("BLOCKED_URL", "Private IPv6 addresses are blocked in production.");
    }
  }

  if (isIP(host) === 0) {
    try {
      const records = await lookup(host, { all: true });
      for (const record of records) {
        if (record.family === 4 && isPrivateIPv4(record.address)) {
          throw new PipelineError("BLOCKED_URL", "URL resolves to a private address.");
        }
        if (record.address === "::1") {
          throw new PipelineError("BLOCKED_URL", "URL resolves to a loopback address.");
        }
      }
    } catch (error) {
      if (error instanceof PipelineError) throw error;
      throw new PipelineError("COMPANY_UNREACHABLE", `Could not resolve host ${host}.`);
    }
  }

  return url;
}

export function resolveLink(base: string, href: string): string | null {
  try {
    const url = new URL(href, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

const MULTI_PART_TLDS = new Set([
  "co.uk",
  "com.au",
  "co.in",
  "com.br",
  "co.nz",
  "co.jp",
  "com.sg",
  "com.mx",
]);

export function registrableDomain(hostname: string): string {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
  if (!host || isLoopbackHost(host) || isIP(host) !== 0) return host;
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  const lastTwo = parts.slice(-2).join(".");
  if (MULTI_PART_TLDS.has(lastTwo)) {
    return parts.length >= 3 ? parts.slice(-3).join(".") : host;
  }
  return lastTwo;
}

export function companySlug(companyUrl: string): string {
  try {
    return registrableDomain(new URL(companyUrl).hostname).split(".")[0] || "";
  } catch {
    return "";
  }
}

export function sameRegistrableOrigin(a: string, b: string): boolean {
  try {
    return registrableDomain(new URL(a).hostname) === registrableDomain(new URL(b).hostname);
  } catch {
    return false;
  }
}

/** Off-site only if we discovered a hiring-looking URL that names this company. */
export function isDiscoveredHiringLink(target: string, companyUrl: string): boolean {
  try {
    const dest = new URL(target);
    const slug = companySlug(companyUrl);
    if (!slug || slug === "localhost" || slug.length < 3) return false;
    const haystack = `${dest.hostname}${dest.pathname}`.toLowerCase();
    if (!/job|career|hiring|opening|recruit/i.test(haystack)) return false;
    return haystack.includes(slug);
  } catch {
    return false;
  }
}

/** Same registrable company, or a hiring URL we actually found that names them. */
export function isInCrawlScope(target: string, companyUrl: string): boolean {
  return sameRegistrableOrigin(companyUrl, target) || isDiscoveredHiringLink(target, companyUrl);
}

export function urlKey(raw: string): string {
  try {
    const url = new URL(raw);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    return `${url.protocol}//${url.host.toLowerCase()}${path}`;
  } catch {
    return raw;
  }
}
