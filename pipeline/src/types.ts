export type RequirementKind = "technical" | "behavioural" | "domain";
export type RequirementPriority = "must" | "nice";
export type QuestionCategory = "technical" | "behavioural" | "system-design" | "company-fit";
export type ItemOrigin = "generated" | "user";
export type ItemStatus = "pristine" | "edited" | "pinned";

export interface Requirement {
  id: string;
  text: string;
  kind: RequirementKind;
  priority: RequirementPriority;
}

export interface Question {
  id: string;
  requirement_ids: string[];
  category: QuestionCategory;
  prompt: string;
  answer_outline: string;
  difficulty: 1 | 2 | 3;
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  requirement_ids: string[];
}

export interface ScheduleDay {
  day: number;
  focus: string;
  question_ids: string[];
  minutes: number;
}

/** Appendix A — field names must match exactly. */
export interface Kit {
  source: {
    company: string;
    company_url: string;
    role: string;
    location: string;
    jd_chars: number;
    researched_at: string;
    pages_used: string[];
  };
  company_brief: {
    summary: string;
    what_they_do: string;
    sources: string[];
  };
  role: {
    title: string;
    seniority: string;
    responsibilities: string[];
    requirements: Requirement[];
  };
  questions: Question[];
  flashcards: Flashcard[];
  schedule: {
    days_available: number;
    days: ScheduleDay[];
  };
  coverage: {
    uncovered_requirement_ids: string[];
    passes: number;
  };
}

export interface ItemState {
  origin: ItemOrigin;
  status: ItemStatus;
}

export interface KitItemState {
  [id: string]: ItemState;
}

export interface ResearchNotes {
  skipped_sources: Array<{ url: string; reason: string }>;
  hiring_page_found: boolean;
  discussion_found: boolean;
  thin_description: boolean;
  pages_considered: string[];
}

export interface PipelineInput {
  jd: string;
  company_url: string;
  days: number;
  company_hint?: string;
  allowPrivateUrls?: boolean;
  onProgress?: (event: PipelineProgress) => void;
}

export interface PipelineProgress {
  step: string;
  message: string;
  percent: number;
}

export interface PipelineResult {
  kit: Kit;
  itemState: KitItemState;
  notes: ResearchNotes;
}

export interface BatchCase {
  id: string;
  jd: string;
  company_url: string;
  days: number;
}

export interface BatchKitEntry {
  id: string;
  status: "ok" | "failed";
  kit: Kit | null;
  error: { code: string; message: string } | null;
}

export interface BatchOutput {
  version: "1.0";
  generated_at: string;
  kits: BatchKitEntry[];
}

export class PipelineError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "PipelineError";
  }
}
