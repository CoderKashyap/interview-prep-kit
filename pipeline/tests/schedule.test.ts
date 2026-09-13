import assert from "node:assert/strict";
import { test } from "node:test";
import { allocateSchedule } from "../src/schedule.js";
import { q, req } from "./helpers.js";

const requirements = [
  req({ id: "r1", text: "React", priority: "must" }),
  req({ id: "r2", text: "CSS", priority: "nice" }),
];

const questions = [
  q({ id: "q1", prompt: "Hard must", requirement_ids: ["r1"], difficulty: 3, category: "technical" }),
  q({ id: "q2", prompt: "Easy nice", requirement_ids: ["r2"], difficulty: 1, category: "behavioural" }),
  q({ id: "q3", prompt: "Mid must", requirement_ids: ["r1"], difficulty: 2, category: "system-design" }),
];

test("emits exactly the requested number of days", () => {
  assert.equal(allocateSchedule(questions, requirements, 5).days.length, 5);
  assert.equal(allocateSchedule(questions, requirements, 1).days.length, 1);
  assert.equal(allocateSchedule(questions, requirements, 60).days.length, 60);
});

test("minutes are integers and every day has a focus", () => {
  const schedule = allocateSchedule(questions, requirements, 3);
  for (const day of schedule.days) {
    assert.equal(Number.isInteger(day.minutes), true);
    assert.ok(day.focus.length > 0);
    assert.ok(day.question_ids.length > 0);
  }
});

test("must-have / harder questions land earlier than nicer easier ones", () => {
  const schedule = allocateSchedule(questions, requirements, 3);
  const dayOf = (id: string) => schedule.days.find((d) => d.question_ids.includes(id))?.day ?? 99;
  assert.ok(dayOf("q1") <= dayOf("q2"));
});

test("every must-have still appears somewhere when questions exist", () => {
  const schedule = allocateSchedule(questions, requirements, 7);
  const scheduled = new Set(schedule.days.flatMap((d) => d.question_ids));
  assert.ok(scheduled.has("q1"));
  assert.ok(scheduled.has("q3"));
});
