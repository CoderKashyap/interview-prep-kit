import type { Question, QuestionCategory, Requirement } from "./types.js";

export function clampDifficulty(value: unknown, fallback: 1 | 2 | 3 = 2): 1 | 2 | 3 {
  if (value === 1 || value === 2 || value === 3) return value;
  if (value == null || (typeof value === "number" && !Number.isFinite(value))) return fallback;
  const numeric = typeof value === "number" ? value : Number(String(value).trim());
  if (numeric === 1 || numeric === 2 || numeric === 3) return numeric;
  const label = String(value).toLowerCase();
  if (/\b(easy|low|beginner)\b/.test(label)) return 1;
  if (/\b(hard|high|advanced)\b/.test(label)) return 3;
  return fallback;
}

/** First clause of the requirement — taken from the posting, not a canned topic list. */
export function topicLabel(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  const clause = compact.split(/[.;]/)[0]?.trim() || compact;
  return clause.length > 90 ? `${clause.slice(0, 87)}…` : clause;
}

export function buildQuestion(req: Requirement, category: QuestionCategory): Pick<Question, "prompt" | "answer_outline" | "difficulty"> {
  const topic = topicLabel(req.text);
  const difficulty: 1 | 2 | 3 = category === "system-design" ? 3 : req.priority === "must" ? 2 : 1;

  if (category === "behavioural") {
    return {
      prompt: `Tell me about a time related to this: ${topic}. What was at stake, what did you do, and what changed?`,
      answer_outline: studyAnswer(req),
      difficulty,
    };
  }
  if (category === "system-design") {
    return {
      prompt: `Design an approach for this: ${topic}. Start with requirements, then data flow, failure modes, and rollout.`,
      answer_outline: studyAnswer(req),
      difficulty: 3,
    };
  }
  if (category === "company-fit") {
    return {
      prompt: `Why does this matter here: ${topic}? Where have you done similar work?`,
      answer_outline: studyAnswer(req),
      difficulty: 1,
    };
  }
  return {
    prompt: `Walk through a production example of this: ${topic}. What was hard, and how did you prove the fix?`,
    answer_outline: studyAnswer(req),
    difficulty,
  };
}

export function studyAnswer(req: Requirement): string {
  const topic = topicLabel(req.text);
  const fact = req.text.replace(/\s+/g, " ").trim().slice(0, 220);
  return `${fact} In the interview, give one story about “${topic}”: what you worked on, what was hard, what you changed, and one number that showed it worked.`;
}

export function buildFlashcard(req: Requirement, related?: Question): { front: string; back: string } {
  const topic = topicLabel(req.text);
  const generic = /name the system, the constraint/i.test(related?.answer_outline ?? "");
  return {
    front: `How would you talk about this in an interview: ${topic}?`,
    back: !generic && related?.answer_outline ? related.answer_outline : studyAnswer(req),
  };
}
