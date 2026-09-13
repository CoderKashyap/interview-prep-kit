import assert from "node:assert/strict";
import { test } from "node:test";
import { generateFlashcards, generateQuestionsForCategory } from "../src/generate.js";
import { buildQuestion, topicLabel } from "../src/questions.js";
import { req } from "./helpers.js";

test("questions are interviewer prompts, not JD pastes", () => {
  const requirement = req({
    id: "r1",
    text: "Work within GitLab's Rails monolith, where much of the event and trigger system lives.",
  });
  const question = buildQuestion(requirement, "technical");
  assert.equal(/demonstrate this requirement/i.test(question.prompt), false);
  assert.equal(question.prompt.includes(requirement.text), false);
  assert.match(question.prompt, /Rails monolith|event/i);
});

test("flashcard fronts are study questions", () => {
  const requirement = req({ id: "r1", text: "Architect for high availability and throughput." });
  const cards = generateFlashcards([requirement], []);
  assert.equal(cards[0].front, `How would you explain ${topicLabel(requirement.text)} in an interview?`);
  assert.notEqual(cards[0].front, requirement.text);
});

test("fallback category generation still covers the requirement id", async () => {
  const requirement = req({ id: "r3", text: "Contribute to an event platform other AI features rely on." });
  const questions = await generateQuestionsForCategory({
    category: "technical",
    requirements: [requirement],
    roleTitle: "Senior Backend Engineer",
    companyBrief: "",
    hiringNotes: "",
    existingQuestionIds: [],
  });
  assert.ok(questions.some((question) => question.requirement_ids.includes("r3")));
  assert.ok(questions.every((question) => !/demonstrate this requirement/i.test(question.prompt)));
});
