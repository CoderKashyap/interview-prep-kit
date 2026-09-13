import { applyCoverage, checkCoverage } from "./coverage.js";
import { crawlCompanySite } from "./crawler.js";
import { findPublicDiscussion } from "./discussion.js";
import { extractRole } from "./extract.js";
import type { FetchedPage } from "./fetchPage.js";
import { generateCompanyBrief, generateFlashcards, generateGapQuestions, generateQuestionsForCategory } from "./generate.js";
import { validateKit } from "./schema.js";
import { applySchedule } from "./schedule.js";
import type { Kit, KitItemState, PipelineInput, PipelineResult, Question, QuestionCategory, ResearchNotes } from "./types.js";
import { PipelineError } from "./types.js";
import { parseHttpUrl } from "./urls.js";

const CATEGORIES: QuestionCategory[] = ["technical", "behavioural", "system-design", "company-fit"];
const MAX_PASSES = 2;

function markGenerated(ids: string[]): KitItemState {
  return Object.fromEntries(ids.map((id) => [id, { origin: "generated" as const, status: "pristine" as const }]));
}

export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const jd = input.jd?.trim() ?? "";
  if (!jd) {
    throw new PipelineError("INVALID_INPUT", "Job description is empty.");
  }

  const days = Math.max(1, Math.min(60, Math.floor(Number(input.days) || 1)));
  const allowPrivate = Boolean(input.allowPrivateUrls);
  const progress = input.onProgress ?? (() => undefined);

  progress({ step: "extract", message: "Extracting requirements from the posting", percent: 8 });
  const extracted = await extractRole(jd);

  let companyUrl: string;
  try {
    companyUrl = parseHttpUrl(input.company_url).toString();
  } catch (error) {
    throw error instanceof PipelineError
      ? error
      : new PipelineError("INVALID_URL", "Company URL is not valid.");
  }

  const notes: ResearchNotes = {
    skipped_sources: [],
    hiring_page_found: false,
    discussion_found: false,
    thin_description: extracted.thin,
    pages_considered: [],
  };

  progress({ step: "crawl", message: "Crawling the company site and ranking links", percent: 22 });
  let pages: FetchedPage[] = [];
  try {
    const crawl = await crawlCompanySite(companyUrl, { allowPrivate });
    pages = crawl.pages;
    notes.skipped_sources.push(...crawl.notes.skipped_sources);
    notes.hiring_page_found = crawl.notes.hiring_page_found;
    notes.pages_considered = crawl.notes.pages_considered;
  } catch (error) {
    const message = error instanceof Error ? error.message : "crawl failed";
    notes.skipped_sources.push({ url: companyUrl, reason: message });
  }

  progress({ step: "discussion", message: "Looking for public interview discussion", percent: 38 });
  let discussionSnippets: string[] = [];
  let discussionSources: string[] = [];
  try {
    const discussion = await findPublicDiscussion(
      companyUrl,
      extracted.company || input.company_hint || "",
      { allowPrivate },
    );
    notes.discussion_found = discussion.found;
    discussionSnippets = discussion.snippets;
    discussionSources = discussion.sources;
    notes.skipped_sources.push(...discussion.skipped);
  } catch (error) {
    notes.skipped_sources.push({
      url: "public-discussion",
      reason: error instanceof Error ? error.message : "discussion search failed",
    });
  }

  const hiringNotes = pages
    .filter((page) => /hire|career|interview|handbook|jobs/i.test(`${page.url} ${page.title}`))
    .map((page) => page.text.slice(0, 1600))
    .join("\n");

  progress({ step: "brief", message: "Writing the company brief from retrieved pages", percent: 48 });
  const brief = await generateCompanyBrief({
    companyName: extracted.company,
    companyUrl,
    pages,
    discussionSnippets,
  });

  progress({ step: "questions", message: "Generating questions by category", percent: 58 });
  let questions: Question[] = [];
  for (const category of CATEGORIES) {
    const relevant = extracted.requirements.filter((req) => {
      if (category === "technical") return req.kind === "technical";
      if (category === "behavioural") return req.kind === "behavioural";
      if (category === "system-design") return req.kind === "technical" || req.kind === "domain";
      return true;
    });
    const generated = await generateQuestionsForCategory({
      category,
      requirements: relevant.length ? relevant : extracted.requirements,
      roleTitle: extracted.title,
      companyBrief: `${brief.summary}\n${brief.what_they_do}`,
      hiringNotes: hiringNotes || (notes.hiring_page_found ? "" : "No hiring page was found."),
      existingQuestionIds: questions.map((q) => q.id),
    });
    questions = questions.concat(generated);
    progress({
      step: "questions",
      message: `Generated ${category} questions`,
      percent: 58 + CATEGORIES.indexOf(category) * 5,
    });
  }

  let passes = 1;
  progress({ step: "coverage", message: "Checking requirement coverage", percent: 78 });
  let coverage = checkCoverage(extracted.requirements, questions);

  while (coverage.uncovered_must_ids.length > 0 && passes < MAX_PASSES) {
    progress({ step: "second-pass", message: "Closing coverage gaps", percent: 84 });
    const gaps = extracted.requirements.filter((req) => coverage.uncovered_must_ids.includes(req.id));
    const extra = await generateGapQuestions({
      gaps,
      existingQuestionIds: questions.map((q) => q.id),
      roleTitle: extracted.title,
    });
    questions = questions.concat(extra);
    passes += 1;
    coverage = checkCoverage(extracted.requirements, questions);
  }

  const flashcards = generateFlashcards(extracted.requirements, questions);
  const companyName =
    extracted.company ||
    (() => {
      try {
        return new URL(companyUrl).hostname.replace(/^www\./, "");
      } catch {
        return "";
      }
    })();

  let kit: Kit = {
    source: {
      company: companyName,
      company_url: companyUrl,
      role: extracted.title,
      location: extracted.location,
      jd_chars: jd.length,
      researched_at: new Date().toISOString(),
      pages_used: [...new Set([...pages.map((p) => p.url), ...discussionSources])],
    },
    company_brief: brief,
    role: {
      title: extracted.title,
      seniority: extracted.seniority,
      responsibilities: extracted.responsibilities,
      requirements: extracted.requirements,
    },
    questions,
    flashcards,
    schedule: { days_available: days, days: [] },
    coverage: { uncovered_requirement_ids: coverage.uncovered_requirement_ids, passes },
  };

  progress({ step: "schedule", message: "Allocating the study schedule", percent: 92 });
  kit = applySchedule(kit, days);
  kit = applyCoverage(kit, passes);
  kit = validateKit(kit);

  const itemState = markGenerated([
    ...kit.role.requirements.map((r) => r.id),
    ...kit.questions.map((q) => q.id),
    ...kit.flashcards.map((f) => f.id),
  ]);

  progress({ step: "ready", message: "Kit ready", percent: 100 });
  return { kit, itemState, notes };
}
