import type { Kit, Question, Requirement, ScheduleDay } from "./types.js";

const MINUTES_BY_DIFFICULTY: Record<1 | 2 | 3, number> = {
  1: 15,
  2: 25,
  3: 40,
};

function questionScore(question: Question, requirements: Map<string, Requirement>): number {
  let mustLinks = 0;
  let niceLinks = 0;
  for (const id of question.requirement_ids) {
    const req = requirements.get(id);
    if (!req) continue;
    if (req.priority === "must") mustLinks += 1;
    else niceLinks += 1;
  }
  return mustLinks * 100 + niceLinks * 10 + question.difficulty;
}

function dominantCategory(questions: Question[]): string {
  if (questions.length === 0) return "Review extracted requirements";
  const counts = new Map<string, number>();
  for (const q of questions) {
    counts.set(q.category, (counts.get(q.category) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const labels: Record<string, string> = {
    technical: "Technical depth",
    behavioural: "Behavioural stories",
    "system-design": "System design",
    "company-fit": "Company and role fit",
  };
  return labels[sorted[0][0]] ?? sorted[0][0];
}

/**
 * Allocate questions across exactly `days` days.
 * Harder / must-have material lands earlier. Minutes are integers.
 */
export function allocateSchedule(
  questions: Question[],
  requirements: Requirement[],
  days: number,
): { days_available: number; days: ScheduleDay[] } {
  const safeDays = Math.max(1, Math.min(60, Math.floor(days)));
  const reqMap = new Map(requirements.map((r) => [r.id, r]));

  const ranked = [...questions].sort((a, b) => questionScore(b, reqMap) - questionScore(a, reqMap));

  const buckets: Question[][] = Array.from({ length: safeDays }, () => []);

  if (ranked.length === 0) {
    return {
      days_available: safeDays,
      days: buckets.map((_, index) => ({
        day: index + 1,
        focus: index === 0 ? "Read the posting and draft stories" : "Rehearse and rest",
        question_ids: [],
        minutes: index === 0 ? 45 : 20,
      })),
    };
  }

  // Ensure every must-have appears: questions already cover them after the second pass.
  // Spread high-score items into earlier days first (round-robin from the front).
  ranked.forEach((question, index) => {
    if (safeDays === 1) {
      buckets[0].push(question);
      return;
    }
    const t = ranked.length <= 1 ? 0 : index / (ranked.length - 1);
    const dayIndex = Math.min(safeDays - 1, Math.floor(t * safeDays));
    buckets[dayIndex].push(question);
  });

  // If a later day is empty because we have fewer questions than days, give it a review slot
  // that repeats the earliest uncovered must-linked question, or the first question.
  const mustQuestion = ranked.find((q) =>
    q.requirement_ids.some((id) => reqMap.get(id)?.priority === "must"),
  );
  for (let i = 0; i < buckets.length; i += 1) {
    if (buckets[i].length === 0) {
      const fallback = mustQuestion ?? ranked[0];
      buckets[i].push(fallback);
    }
  }

  const daysOut: ScheduleDay[] = buckets.map((bucket, index) => {
    const unique = [...new Map(bucket.map((q) => [q.id, q])).values()];
    const minutes = unique.reduce((sum, q) => sum + MINUTES_BY_DIFFICULTY[q.difficulty], 0);
    return {
      day: index + 1,
      focus: dominantCategory(unique),
      question_ids: unique.map((q) => q.id),
      minutes: Math.max(15, minutes),
    };
  });

  return { days_available: safeDays, days: daysOut };
}

export function applySchedule(kit: Kit, days: number): Kit {
  return {
    ...kit,
    schedule: allocateSchedule(kit.questions, kit.role.requirements, days),
  };
}
