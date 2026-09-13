import type { Kit, Question, Requirement } from "../src/types.js";

export function req(partial: Partial<Requirement> & Pick<Requirement, "id" | "text">): Requirement {
  return {
    kind: "technical",
    priority: "must",
    ...partial,
  };
}

export function q(partial: Partial<Question> & Pick<Question, "id" | "prompt">): Question {
  return {
    requirement_ids: [],
    category: "technical",
    answer_outline: "outline",
    difficulty: 2,
    ...partial,
  };
}

export function sampleKit(overrides: Partial<Kit> = {}): Kit {
  const requirements = [req({ id: "r1", text: "5+ years with React" })];
  const questions = [q({ id: "q1", prompt: "Explain React", requirement_ids: ["r1"] })];
  return {
    source: {
      company: "Acme",
      company_url: "http://localhost:8099/acme/",
      role: "Engineer",
      location: "Remote",
      jd_chars: 120,
      researched_at: "2026-09-01T09:12:44Z",
      pages_used: ["http://localhost:8099/acme/"],
    },
    company_brief: {
      summary: "Acme builds tools.",
      what_they_do: "Software",
      sources: ["http://localhost:8099/acme/"],
    },
    role: {
      title: "Engineer",
      seniority: "senior",
      responsibilities: ["Build things"],
      requirements,
    },
    questions,
    flashcards: [{ id: "f1", front: "React", back: "UI library", requirement_ids: ["r1"] }],
    schedule: {
      days_available: 1,
      days: [{ day: 1, focus: "Technical depth", question_ids: ["q1"], minutes: 25 }],
    },
    coverage: { uncovered_requirement_ids: [], passes: 1 },
    ...overrides,
  };
}
