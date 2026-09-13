import type { Question, QuestionCategory, Requirement } from "./types.js";

export function topicLabel(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (/rails monolith/i.test(compact)) return "working inside a large Rails monolith";
  if (/event (platform|pipeline|system)|events at scale/i.test(compact)) {
    return "an event platform that other features depend on";
  }
  if (/high availability|throughput|at scale/i.test(compact)) {
    return "high-availability, high-throughput backend design";
  }
  if (/mentor/i.test(compact)) return "mentoring junior engineers";
  if (/architect(?:ure)? direction|product and architecture/i.test(compact)) {
    return "influencing architecture on a multi-service product";
  }
  if (/\bruby\b/i.test(compact) && /\brails\b/i.test(compact)) return "Ruby on Rails backend work";
  if (/\bruby\b/i.test(compact)) return "Ruby backend work";
  if (/\brails\b/i.test(compact)) return "Rails services";
  if (/\bnode\.?js\b/i.test(compact)) return "Node.js APIs";
  if (/postgres|mongodb|sql/i.test(compact)) return "data modelling and query design";
  if (/kubernetes|ci\/?cd/i.test(compact)) return "shipping and operating services";
  const clause = compact.split(/[.;]/)[0].trim();
  return clause.length > 90 ? `${clause.slice(0, 87)}…` : clause;
}

export function buildQuestion(req: Requirement, category: QuestionCategory): Pick<Question, "prompt" | "answer_outline" | "difficulty"> {
  const topic = topicLabel(req.text);
  const difficulty: 1 | 2 | 3 = category === "system-design" ? 3 : req.priority === "must" ? 2 : 1;

  if (category === "behavioural") {
    return {
      prompt: `Tell me about a time you practised ${topic}. What was at stake, what did you do, and what changed?`,
      answer_outline: `STAR: situation, your action, a metric. Call out one thing you would do differently. Anchor it to: ${req.text.slice(0, 140)}`,
      difficulty,
    };
  }
  if (category === "system-design") {
    return {
      prompt: `Design a backend that can handle ${topic}. Start with requirements, then data flow, failure modes, and rollout.`,
      answer_outline:
        "Clarify load, latency, and consistency. Sketch producers, storage, and consumers. Mention backpressure, retries, and how you would observe it in production.",
      difficulty: 3,
    };
  }
  if (category === "company-fit") {
    return {
      prompt: `Why does ${topic} matter for this company, and where have you done similar work?`,
      answer_outline:
        "Connect the posting to what the company actually ships. Give one concrete example. Stay honest if the public site said little.",
      difficulty: 1,
    };
  }
  return {
    prompt: `Walk through a production example of ${topic}. What broke or scaled poorly, and how did you prove the fix?`,
    answer_outline:
      "Name the system, the constraint, the change you made, and the metric. Mention one pitfall interviewers will probe (coupling, data loss, or operability).",
    difficulty,
  };
}

export function buildFlashcard(req: Requirement, related?: Question): { front: string; back: string } {
  const topic = topicLabel(req.text);
  return {
    front: `How would you explain ${topic} in an interview?`,
    back:
      related?.answer_outline ||
      `${req.text.slice(0, 180)} Use one example, one trade-off, and one metric.`,
  };
}
