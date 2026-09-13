import assert from "node:assert/strict";
import { test } from "node:test";
import { extractRequirementsHeuristic } from "../src/extract.js";

test("keeps years-of-experience lines and marks bonus lines as nice", () => {
  const extracted = extractRequirementsHeuristic(`Senior Backend Engineer

Required:
- 5+ years with Node.js
- Mentoring junior engineers
Nice to have:
- Kafka experience
`);
  assert.equal(extracted.requirements[0].text, "5+ years with Node.js");
  assert.equal(extracted.requirements[0].priority, "must");
  const kafka = extracted.requirements.find((req) => /Kafka/i.test(req.text));
  assert.equal(kafka?.priority, "nice");
  const mentoring = extracted.requirements.find((req) => /Mentor/i.test(req.text));
  assert.equal(mentoring?.kind, "behavioural");
});

test("a two-line stub stays thin and does not invent skills", () => {
  const extracted = extractRequirementsHeuristic("Engineer\nCome work with us.");
  assert.equal(extracted.thin, true);
  assert.ok(extracted.requirements.length <= 2);
});

test("drops location and overview headers, keeps real skills from a prose JD", () => {
  const extracted = extractRequirementsHeuristic(`Senior Backend Engineer (Ruby)

Remote, United Kingdom
An overview of this role
Contribute to the broader event platform, the core infrastructure that many of GitLab's AI features rely on.
Work within GitLab's Rails monolith, where much of the event and trigger system lives.
Mentoring junior engineers
`);
  const texts = extracted.requirements.map((req) => req.text);
  assert.ok(!texts.some((text) => /united kingdom|overview of this role/i.test(text)));
  assert.ok(texts.some((text) => /event platform|Rails monolith|Mentoring/i.test(text)));
});
