export type KitStatus = "pending" | "researching" | "generating" | "checking" | "ready" | "failed";

export interface Requirement {
  id: string;
  text: string;
  kind: "technical" | "behavioural" | "domain";
  priority: "must" | "nice";
}

export interface Question {
  id: string;
  requirement_ids: string[];
  category: "technical" | "behavioural" | "system-design" | "company-fit";
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

export interface KitPayload {
  source: {
    company: string;
    company_url: string;
    role: string;
    location: string;
    jd_chars: number;
    researched_at: string;
    pages_used: string[];
  };
  company_brief: { summary: string; what_they_do: string; sources: string[] };
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
    days: Array<{ day: number; focus: string; question_ids: string[]; minutes: number }>;
  };
  coverage: { uncovered_requirement_ids: string[]; passes: number };
}

export interface ItemState {
  origin: "generated" | "user";
  status: "pristine" | "edited" | "pinned";
}

export interface KitRecord {
  id: string;
  status: KitStatus;
  progress: { step: string; message: string; percent: number };
  input: { jd: string; company_url: string; days: number };
  kit: KitPayload | null;
  itemState: Record<string, ItemState>;
  notes: {
    skipped_sources: Array<{ url: string; reason: string }>;
    hiring_page_found: boolean;
    discussion_found: boolean;
    thin_description: boolean;
    pages_considered: string[];
  } | null;
  error: { code: string; message: string } | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface KitSummary {
  id: string;
  status: KitStatus;
  progress: { step: string; message: string; percent: number };
  input: { company_url: string; days: number; jd_chars: number };
  role: string;
  company: string;
  error: { code: string; message: string } | null;
  updatedAt: string;
}
