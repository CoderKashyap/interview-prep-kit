import assert from "node:assert/strict";
import { test } from "node:test";
import { generateFlashcards, generateQuestionsForCategory } from "../src/generate.js";
import { briefFromPages, looksLikeNavDump } from "../src/brief.js";
import { buildQuestion, studyAnswer, topicLabel } from "../src/questions.js";
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

test("each flashcard back is about that requirement, not a shared template", () => {
  const rails = req({ id: "r1", text: "Work within GitLab's Rails monolith." });
  const events = req({ id: "r2", text: "Contribute to an event platform other AI features rely on." });
  const cards = generateFlashcards([rails, events], []);
  assert.notEqual(cards[0].back, cards[1].back);
  assert.equal(/name the system, the constraint/i.test(cards[0].back), false);
  assert.match(cards[0].back, /Rails monolith/i);
  assert.match(studyAnswer(rails), /Rails monolith/i);
});

test("company brief fallback drops login-nav dumps", () => {
  const brief = briefFromPages(
    [
      {
        url: "https://gitlab.com/",
        title: "GitLab",
        text: "Close To search repositories and projects, log in to gitlab.com. Suggestions GitLab Duo Agent Platform",
        links: [],
        contentType: "text/html",
      },
      {
        url: "https://about.gitlab.com/company/",
        title: "Company",
        text: "GitLab is The DevSecOps Platform. Teams use it to deliver software faster with a single application for the entire software lifecycle.",
        links: [],
        contentType: "text/html",
      },
    ],
    "https://gitlab.com",
    "GitLab",
  );
  assert.equal(looksLikeNavDump("Close To search repositories login GitLab Duo"), true);
  assert.match(brief.what_they_do, /DevSecOps|software/i);
  assert.equal(/summarisation failed/i.test(brief.summary), false);
});
