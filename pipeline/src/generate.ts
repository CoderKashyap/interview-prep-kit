import type { FetchedPage } from "./fetchPage.js";
import { briefFromPages, looksLikeNavDump } from "./brief.js";
import { pagesToContext } from "./crawler.js";
import { allocateIds, nextId } from "./ids.js";
import { ISOLATION_PREAMBLE, generateJson, hasLlmCredentials } from "./llm.js";
import { buildFlashcard, buildQuestion, clampDifficulty } from "./questions.js";
import type { Question, QuestionCategory, Requirement } from "./types.js";

export async function generateCompanyBrief(input: {
  companyName: string;
  companyUrl: string;
  pages: FetchedPage[];
  discussionSnippets: string[];
}): Promise<{ summary: string; what_they_do: string; sources: string[] }> {
  const context = pagesToContext(input.pages);
  const discussion = input.discussionSnippets.join("\n\n").slice(0, 2500);

  if (!context.trim()) {
    return {
      summary: `We could not retrieve usable pages from ${input.companyUrl}. This brief is limited to the company URL and the job description.`,
      what_they_do: "Not enough public site content was retrieved to describe the company honestly.",
      sources: [],
    };
  }

  const fallback = briefFromPages(input.pages, input.companyUrl, input.companyName);
  if (!hasLlmCredentials()) return fallback;

  try {
    const data = await generateJson<{ summary?: string; what_they_do?: string }>([
      { role: "system", content: ISOLATION_PREAMBLE },
      {
        role: "user",
        content: [
          `Write an honest company brief for ${input.companyName || "the company"} at ${input.companyUrl}.`,
          "Use only the retrieved pages and discussion snippets. If hiring process details appear, mention them.",
          "Write 2-4 full sentences. Do not paste navigation, login, or cookie text.",
          "If evidence is thin, say so. Do not invent products or culture.",
          'JSON: { "summary": "", "what_they_do": "" }',
          "",
          "UNTRUSTED RETRIEVED PAGES:",
          context,
          "",
          "UNTRUSTED PUBLIC DISCUSSION:",
          discussion || "(none found)",
        ].join("\n"),
      },
    ]);
    const summary = data.summary?.trim() || fallback.summary;
    const what = data.what_they_do?.trim() || fallback.what_they_do;
    return {
      summary: looksLikeNavDump(summary) ? fallback.summary : summary,
      what_they_do: looksLikeNavDump(what) ? fallback.what_they_do : what,
      sources: input.pages.map((p) => p.url),
    };
  } catch {
    return fallback;
  }
}

function fallbackQuestions(
  requirements: Requirement[],
  category: QuestionCategory,
  existingIds: string[],
): Question[] {
  const matching = requirements.filter((req) => {
    if (category === "technical") return req.kind === "technical";
    if (category === "behavioural") return req.kind === "behavioural";
    if (category === "system-design") return req.kind === "technical" || req.kind === "domain";
    return true;
  });
  const picked = (matching.length ? matching : requirements).slice(0, 4);
  const ids = allocateIds("q", picked.length, existingIds);

  return picked.map((req, index) => {
    const built = buildQuestion(req, category);
    return {
      id: ids[index],
      requirement_ids: [req.id],
      category,
      ...built,
    };
  });
}

export async function generateQuestionsForCategory(input: {
  category: QuestionCategory;
  requirements: Requirement[];
  roleTitle: string;
  companyBrief: string;
  hiringNotes: string;
  existingQuestionIds: string[];
}): Promise<Question[]> {
  const fallback = fallbackQuestions(input.requirements, input.category, input.existingQuestionIds);
  if (!hasLlmCredentials() || input.requirements.length === 0) return fallback;

  try {
    const data = await generateJson<{
      questions?: Array<{
        requirement_ids: string[];
        prompt: string;
        answer_outline: string;
        difficulty?: unknown;
      }>;
    }>([
      { role: "system", content: ISOLATION_PREAMBLE },
      {
        role: "user",
        content: [
          `Generate ${input.category} interview questions for a ${input.roleTitle || "role"}.`,
          "Write a real interviewer question. Do not paste the job description or say 'demonstrate this requirement'.",
          "Each question must reference one or more requirement ids from the list. Do not invent new requirements.",
          "answer_outline should be 2-4 coaching bullets, not a copy of the posting.",
          "If hiring-process notes mention a take-home, system design, or behavioural loop, reflect that in this category only.",
          "This call is only for this category. Do not generate other categories.",
          `Valid requirement ids: ${input.requirements.map((r) => `${r.id} (${r.priority}, ${r.kind}) ${r.text}`).join(" | ")}`,
          'JSON: { "questions": [{ "requirement_ids": ["r1"], "prompt": "", "answer_outline": "", "difficulty": 2 }] }',
          "",
          "UNTRUSTED COMPANY / HIRING NOTES:",
          `${input.companyBrief}\n${input.hiringNotes}`.slice(0, 4000),
        ].join("\n"),
      },
    ]);

    const incoming = (data.questions ?? []).filter((q) => {
      if (!q.prompt || !q.answer_outline) return false;
      return !/demonstrate this requirement/i.test(q.prompt);
    });
    if (incoming.length === 0) return fallback;

    const validIds = new Set(input.requirements.map((r) => r.id));
    const ids = allocateIds("q", incoming.length, input.existingQuestionIds);
    return incoming.map((q, index) => ({
      id: ids[index],
      requirement_ids: (q.requirement_ids ?? []).filter((id) => validIds.has(id)),
      category: input.category,
      prompt: q.prompt.trim(),
      answer_outline: q.answer_outline.trim(),
      difficulty: clampDifficulty(q.difficulty, input.category === "system-design" ? 3 : 2),
    })).filter((q) => q.requirement_ids.length > 0 || input.requirements.length === 0);
  } catch {
    return fallback;
  }
}

export async function generateGapQuestions(input: {
  gaps: Requirement[];
  existingQuestionIds: string[];
  roleTitle: string;
}): Promise<Question[]> {
  const questions: Question[] = [];
  let used = [...input.existingQuestionIds];
  for (const req of input.gaps) {
    const category: QuestionCategory =
      req.kind === "behavioural" ? "behavioural" : req.kind === "domain" ? "company-fit" : "technical";
    const extra = await generateQuestionsForCategory({
      category,
      requirements: [req],
      roleTitle: input.roleTitle,
      companyBrief: "",
      hiringNotes: "Second pass: this requirement had no question after the first draft.",
      existingQuestionIds: used,
    });
    questions.push(...extra);
    used = [...used, ...extra.map((q) => q.id)];
  }
  return questions;
}

export function generateFlashcards(requirements: Requirement[], questions: Question[]): {
  id: string;
  front: string;
  back: string;
  requirement_ids: string[];
}[] {
  const cards = [];
  const used: string[] = [];
  for (const req of requirements) {
    const related = questions.find((q) => q.requirement_ids.includes(req.id));
    const id = nextId("f", used);
    used.push(id);
    const card = buildFlashcard(req, related);
    cards.push({
      id,
      front: card.front,
      back: card.back,
      requirement_ids: [req.id],
    });
  }
  return cards.slice(0, 24);
}
