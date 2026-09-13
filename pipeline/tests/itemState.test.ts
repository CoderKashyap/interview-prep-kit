import assert from "node:assert/strict";
import { test } from "node:test";
import { survivingQuestions } from "../src/itemState.js";
import { q } from "./helpers.js";

test("regenerating a category keeps edited and user questions", () => {
  const existing = [
    q({ id: "q1", prompt: "generated untouched" }),
    q({ id: "q2", prompt: "I edited this" }),
    q({ id: "q3", prompt: "I wrote this" }),
  ];
  const generated = [
    q({ id: "q4", prompt: "fresh generated" }),
  ];
  const kept = survivingQuestions(existing, generated, {
    q1: { origin: "generated", status: "pristine" },
    q2: { origin: "generated", status: "edited" },
    q3: { origin: "user", status: "pinned" },
  });
  assert.deepEqual(kept.map((item) => item.id), ["q2", "q3", "q4"]);
});
