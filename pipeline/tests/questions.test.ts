import assert from "node:assert/strict";
import { test } from "node:test";
import { generateFlashcards, generateQuestionsForCategory } from "../src/generate.js";
import { briefFromPages, looksLikeNavDump } from "../src/brief.js";
import { buildQuestion, clampDifficulty, studyAnswer, topicLabel } from "../src/questions.js";
import { req } from "./helpers.js";

test("difficulty from the model is coerced to 1, 2, or 3", () => {
  assert.equal(clampDifficulty(2), 2);
  assert.equal(clampDifficulty("3"), 3);
  assert.equal(clampDifficulty("easy"), 1);
  assert.equal(clampDifficulty("hard"), 3);
  assert.equal(clampDifficulty(Number.NaN, 2), 2);
  assert.equal(clampDifficulty(undefined, 2), 2);
});

test("questions are interviewer prompts, not JD pastes", () => {
  const requirement = req({
    id: "r1",
    text: "Work within GitLab's Rails monolith, where much of the event and trigger system lives.",
  });
  const question = buildQuestion(requirement, "technical");
  assert.equal(/demonstrate this requirement/i.test(question.prompt), false);
  assert.match(question.prompt, /Walk through a production example/);
  assert.match(question.prompt, /Rails monolith|event/i);
});

test("flashcard fronts are study questions", () => {
  const requirement = req({ id: "r1", text: "Architect for high availability and throughput." });
  const cards = generateFlashcards([requirement], []);
  assert.equal(cards[0].front, `How would you talk about this in an interview: ${topicLabel(requirement.text)}?`);
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

test("company brief fallback drops product-menu dumps", () => {
  const dump =
    "Suggestions GitLab Duo Agent Platform Code Suggestions (AI) CI/CD GitLab on AWS GitLab on Google Cloud Why GitLab? Platform Execution & Workflows CI/CD Source Code Management Agile delivery Security & Governance";
  assert.equal(looksLikeNavDump(dump), true);
  const brief = briefFromPages(
    [
      {
        url: "https://about.gitlab.com/",
        title: "About",
        text: dump,
        links: [],
        contentType: "text/html",
      },
    ],
    "https://about.gitlab.com/",
    "",
  );
  assert.match(brief.what_they_do, /did not include a clear product paragraph/i);
  assert.equal(/Duo Agent|Why GitLab/i.test(brief.what_they_do), false);
});

test("company brief prefers a company page over homepage banners", () => {
  const homepage =
    "Transcend returns on October 6. Register now Speed you can trust. Try for free Learn more 19.3 What's new in GitLab. Join the 50+ million people already using GitLab. Why GitLab?";
  assert.equal(looksLikeNavDump(homepage), true);
  const brief = briefFromPages(
    [
      {
        url: "https://about.gitlab.com/",
        title: "The DevSecOps Platform",
        text: homepage,
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
    "https://about.gitlab.com/",
    "",
  );
  assert.match(brief.what_they_do, /DevSecOps|software lifecycle/i);
  assert.equal(/Register now|Try for free|What'?s new/i.test(brief.what_they_do), false);
});

test("company brief drops a chip list stuck in front of real copy", () => {
  const mixed =
    "Suggestions GitLab Duo Agent Platform Code Suggestions (AI) CI/CD GitLab on AWS GitLab on Google Cloud Why GitLab? About GitLab Behind the scenes of the intelligent orchestration platform What we do We're the people behind GitLab, the intelligent orchestration platform where teams and their AI agents ship secure software faster. What started in 2011 as an open source project to help one team of programmers collaborate is now used by millions of people.";
  const brief = briefFromPages(
    [
      {
        url: "https://about.gitlab.com/company/",
        title: "Company",
        text: mixed,
        links: [],
        contentType: "text/html",
      },
    ],
    "https://about.gitlab.com/",
    "",
  );
  assert.match(brief.what_they_do, /people behind GitLab|2011|open source/i);
  assert.equal(/Suggestions|Duo Agent|Why GitLab\?/i.test(brief.what_they_do), false);
});
