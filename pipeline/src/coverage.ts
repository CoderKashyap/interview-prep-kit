import type { Kit, Question, Requirement } from "./types.js";

export interface CoverageResult {
  uncovered_requirement_ids: string[];
  uncovered_must_ids: string[];
  uncovered_nice_ids: string[];
}

/**
 * Deterministic coverage check — this is the application's decision, not the model's.
 * A requirement is covered when at least one question lists its id.
 */
export function checkCoverage(
  requirements: Requirement[],
  questions: Question[],
): CoverageResult {
  const covered = new Set<string>();
  for (const question of questions) {
    for (const id of question.requirement_ids) {
      covered.add(id);
    }
  }

  const uncovered = requirements.filter((req) => !covered.has(req.id));
  return {
    uncovered_requirement_ids: uncovered.map((req) => req.id),
    uncovered_must_ids: uncovered.filter((req) => req.priority === "must").map((req) => req.id),
    uncovered_nice_ids: uncovered.filter((req) => req.priority === "nice").map((req) => req.id),
  };
}

export function applyCoverage(kit: Kit, passes: number): Kit {
  const result = checkCoverage(kit.role.requirements, kit.questions);
  return {
    ...kit,
    coverage: {
      uncovered_requirement_ids: result.uncovered_requirement_ids,
      passes,
    },
  };
}

export function mustHaveIds(requirements: Requirement[]): string[] {
  return requirements.filter((req) => req.priority === "must").map((req) => req.id);
}
