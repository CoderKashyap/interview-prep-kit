import { allocateIds } from "./ids.js";
import { ISOLATION_PREAMBLE, generateJson, hasLlmCredentials } from "./llm.js";
import type { Requirement, RequirementKind, RequirementPriority } from "./types.js";

export interface ExtractedRole {
  title: string;
  seniority: string;
  location: string;
  company: string;
  responsibilities: string[];
  requirements: Requirement[];
  thin: boolean;
}

const KIND_FROM_TEXT: Array<[RegExp, RequirementKind]> = [
  [/mentor|stakeholder|communicat|lead|collaborat|influenc|team/i, "behavioural"],
  [/domain|industry|compliance/i, "domain"],
];

const JUNK_REQUIREMENT = [
  /^(an )?overview of (this |the )?role/i,
  /^(remote|hybrid|on-?site)\b/i,
  /united kingdom|united states/i,
  /^(about (the )?(role|company|us)|responsibilit|qualif|what you.?ll|you will|overview|location)\b/i,
  /^(we are|come work|join us)\b/i,
  /^[A-Z][a-z]+,\s+[A-Z]/,
];

const SKILL_SIGNAL =
  /experience|years|\d+\+|proficien|architect|design|mentor|debug|build|operate|scale|availab|throughput|on-call|ci\/?cd|test|infra|monolith|event|pipeline|api|sql|backend|frontend|distributed|reliability|observab|workflow|skill|knowledge|familiar/i;

function inferKind(text: string): RequirementKind {
  for (const [pattern, kind] of KIND_FROM_TEXT) {
    if (pattern.test(text)) return kind;
  }
  return "technical";
}

function inferPriority(text: string, section: "must" | "nice" | "unknown"): RequirementPriority {
  if (section !== "unknown") return section;
  if (/bonus|nice to have|plus|preferred|optional/i.test(text)) return "nice";
  return "must";
}

export function isUsableRequirement(text: string): boolean {
  const value = text.replace(/\s+/g, " ").trim();
  if (value.length < 16 || value.length > 280) return false;
  if (JUNK_REQUIREMENT.some((pattern) => pattern.test(value))) return false;
  if (value.split(/\s+/).length < 4 && !SKILL_SIGNAL.test(value)) return false;
  return SKILL_SIGNAL.test(value) || value.split(/\s+/).length >= 10;
}

function sentences(jd: string): string[] {
  return jd
    .split(/\r?\n|(?<=[.!?])\s+(?=[A-Z])/)
    .map((line) => line.replace(/^[-*•]\s+/, "").replace(/^\d+[.)]\s+/, "").trim())
    .filter(Boolean);
}

/**
 * Heuristic extractor used when the model is unavailable or returns nothing useful.
 * It only lifts lines that are already in the posting — it does not invent skills.
 */
export function extractRequirementsHeuristic(jd: string): ExtractedRole {
  const lines = jd.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const title = lines[0]?.replace(/^#+\s*/, "").slice(0, 120) || "Role";
  const seniorityMatch = jd.match(/\b(intern|junior|mid-level|mid|senior|staff|principal|lead|director)\b/i);
  const locationMatch = jd.match(/\b(remote|hybrid|on-?site)[^.\n]{0,40}/i);

  let section: "must" | "nice" | "unknown" = "unknown";
  const raw: Array<{ text: string; priority: RequirementPriority }> = [];

  for (const line of lines.slice(1)) {
    if (/nice to have|bonus|preferred qualities/i.test(line) && line.length < 80) {
      section = "nice";
      continue;
    }
    if (/requirement|must have|you have|qualifications|what you.?ll need|required/i.test(line) && line.length < 80) {
      section = "must";
      continue;
    }
    const bullet = line.replace(/^[-*•]\s+/, "").replace(/^\d+[.)]\s+/, "").trim();
    if (!isUsableRequirement(bullet)) continue;
    raw.push({ text: bullet, priority: inferPriority(bullet, section) });
  }

  if (raw.length < 2) {
    for (const part of sentences(jd).slice(1)) {
      if (!isUsableRequirement(part)) continue;
      if (raw.some((item) => item.text === part)) continue;
      raw.push({ text: part, priority: "must" });
    }
  }

  const unique = raw.filter((item, index, arr) => arr.findIndex((other) => other.text === item.text) === index);
  const limited = unique.slice(0, 12);
  const ids = allocateIds("r", limited.length);
  const requirements: Requirement[] = limited.map((item, index) => ({
    id: ids[index],
    text: item.text,
    kind: inferKind(item.text),
    priority: item.priority,
  }));

  const responsibilities = lines
    .filter((line) => /^[-*•]/.test(line) || /you will|you.?ll/i.test(line))
    .map((line) => line.replace(/^[-*•]\s+/, "").replace(/^\d+[.)]\s+/, ""))
    .filter((line) => isUsableRequirement(line) || (line.length > 20 && line.length < 220))
    .slice(0, 8);

  return {
    title,
    seniority: seniorityMatch?.[1] ?? "",
    location: locationMatch?.[0] ?? "",
    company: "",
    responsibilities: responsibilities.length ? responsibilities : lines.slice(1, 4).filter((line) => line.length < 180),
    requirements,
    thin: jd.trim().length < 280 || requirements.length <= 2,
  };
}

export async function extractRole(jd: string): Promise<ExtractedRole> {
  const fallback = extractRequirementsHeuristic(jd);
  if (!hasLlmCredentials()) return fallback;

  try {
    const data = await generateJson<{
      title?: string;
      seniority?: string;
      location?: string;
      company?: string;
      responsibilities?: string[];
      requirements?: Array<{ text: string; kind: RequirementKind; priority: RequirementPriority }>;
    }>([
      { role: "system", content: ISOLATION_PREAMBLE },
      {
        role: "user",
        content: [
          "Extract interview-testable requirements from this job description.",
          "A requirement is a skill, qualification, or concrete responsibility an interviewer would probe.",
          "Do NOT include location, work model (remote/hybrid), section titles, or 'overview of this role' sentences.",
          "Rewrite long marketing paragraphs into one short skill line. Keep the meaning. Do not invent skills.",
          "Mark required lines as must and bonus/preferred lines as nice.",
          "kind must be technical, behavioural, or domain.",
          "If the posting is a stub, return few requirements.",
          'JSON shape: { "title": "", "seniority": "", "location": "", "company": "", "responsibilities": [""], "requirements": [{ "text": "", "kind": "technical", "priority": "must" }] }',
          "",
          "UNTRUSTED JOB DESCRIPTION:",
          jd.slice(0, 12_000),
        ].join("\n"),
      },
    ]);

    const incoming = (data.requirements ?? [])
      .map((req) => ({ ...req, text: req.text?.trim() ?? "" }))
      .filter((req) => isUsableRequirement(req.text));
    if (incoming.length === 0) return fallback;

    const ids = allocateIds("r", incoming.length);
    return {
      title: data.title?.trim() || fallback.title,
      seniority: data.seniority?.trim() || fallback.seniority,
      location: data.location?.trim() || fallback.location,
      company: data.company?.trim() || fallback.company,
      responsibilities: (data.responsibilities ?? []).filter(Boolean).slice(0, 12),
      requirements: incoming.slice(0, 16).map((req, index) => ({
        id: ids[index],
        text: req.text,
        kind: req.kind,
        priority: req.priority,
      })),
      thin: jd.trim().length < 280 || incoming.length <= 2,
    };
  } catch {
    return fallback;
  }
}
