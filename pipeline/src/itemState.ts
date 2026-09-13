import type { Kit, KitItemState, Question } from "./types.js";

export function survivingQuestions(
  existing: Question[],
  generated: Question[],
  itemState: KitItemState,
): Question[] {
  const kept = existing.filter((question) => {
    const state = itemState[question.id];
    if (!state) return false;
    return state.origin === "user" || state.status === "edited" || state.status === "pinned";
  });
  const keptIds = new Set(kept.map((q) => q.id));
  const replacements = generated.filter((question) => !keptIds.has(question.id));
  return [...kept, ...replacements];
}

export function markEdited(itemState: KitItemState, id: string): KitItemState {
  const prev = itemState[id] ?? { origin: "user" as const, status: "pristine" as const };
  return {
    ...itemState,
    [id]: {
      origin: prev.origin,
      status: prev.origin === "user" ? "pinned" : "edited",
    },
  };
}

export function markUserCreated(itemState: KitItemState, id: string): KitItemState {
  return { ...itemState, [id]: { origin: "user", status: "pinned" } };
}

export function dropItem(itemState: KitItemState, id: string): KitItemState {
  const next = { ...itemState };
  delete next[id];
  return next;
}

export function mergeKitQuestions(kit: Kit, questions: Question[]): Kit {
  return { ...kit, questions };
}
