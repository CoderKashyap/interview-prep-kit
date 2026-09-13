import assert from "node:assert/strict";
import { test } from "node:test";
import { checkCoverage } from "../src/coverage.js";
import { q, req } from "./helpers.js";

test("a must-have with no linked question is a gap", () => {
  const result = checkCoverage(
    [req({ id: "r1", text: "React" }), req({ id: "r2", text: "Mentoring", kind: "behavioural", priority: "nice" })],
    [q({ id: "q1", prompt: "React", requirement_ids: ["r1"] })],
  );
  assert.deepEqual(result.uncovered_must_ids, []);
  assert.deepEqual(result.uncovered_nice_ids, ["r2"]);
});

test("coverage is decided by requirement ids, not wording", () => {
  const result = checkCoverage(
    [req({ id: "r1", text: "Five years of React" })],
    [q({ id: "q1", prompt: "Something else entirely", requirement_ids: [] })],
  );
  assert.deepEqual(result.uncovered_must_ids, ["r1"]);
});

test("second-pass style: adding a question closes the gap", () => {
  const requirements = [req({ id: "r1", text: "React" }), req({ id: "r2", text: "Node" })];
  const first = checkCoverage(requirements, [q({ id: "q1", prompt: "React", requirement_ids: ["r1"] })]);
  assert.deepEqual(first.uncovered_must_ids, ["r2"]);
  const second = checkCoverage(requirements, [
    q({ id: "q1", prompt: "React", requirement_ids: ["r1"] }),
    q({ id: "q2", prompt: "Node", requirement_ids: ["r2"] }),
  ]);
  assert.deepEqual(second.uncovered_requirement_ids, []);
});
