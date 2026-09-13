import assert from "node:assert/strict";
import { test } from "node:test";
import { safeValidateKit, validateKit } from "../src/schema.js";
import { sampleKit } from "./helpers.js";

test("accepts a kit that matches Appendix A", () => {
  const kit = validateKit(sampleKit());
  assert.equal(kit.source.company, "Acme");
  assert.equal(kit.questions[0].difficulty, 2);
});

test("rejects a schedule that references a missing question", () => {
  const result = safeValidateKit(
    sampleKit({
      schedule: {
        days_available: 1,
        days: [{ day: 1, focus: "X", question_ids: ["q-missing"], minutes: 20 }],
      },
    }),
  );
  assert.equal(result.success, false);
});

test("rejects float minutes and rejects days_available mismatch", () => {
  const minutes = safeValidateKit(
    sampleKit({
      schedule: {
        days_available: 1,
        days: [{ day: 1, focus: "X", question_ids: ["q1"], minutes: 20.5 as unknown as number }],
      },
    }),
  );
  assert.equal(minutes.success, false);

  const mismatch = safeValidateKit(
    sampleKit({
      schedule: {
        days_available: 5,
        days: [{ day: 1, focus: "X", question_ids: ["q1"], minutes: 20 }],
      },
    }),
  );
  assert.equal(mismatch.success, false);
});
