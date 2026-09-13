import assert from "node:assert/strict";
import { test } from "node:test";
import { looksLikeHiringPage, scoreLink } from "../src/crawler.js";
import { cleanPage } from "../src/fetchPage.js";
import { isInCrawlScope, registrableDomain, sameRegistrableOrigin } from "../src/urls.js";

test("gitlab.com and about.gitlab.com are the same company", () => {
  assert.equal(registrableDomain("about.gitlab.com"), "gitlab.com");
  assert.equal(sameRegistrableOrigin("https://gitlab.com/", "https://about.gitlab.com/jobs/all-jobs/"), true);
});

test("a Greenhouse board for that company is in crawl scope", () => {
  assert.equal(
    isInCrawlScope("https://job-boards.greenhouse.io/gitlab/jobs/8693103002", "https://gitlab.com"),
    true,
  );
  assert.equal(
    isInCrawlScope("https://job-boards.greenhouse.io/acme/jobs/1", "https://gitlab.com"),
    false,
  );
});

test("jobs and about pages outrank the homepage", () => {
  assert.ok(scoreLink("https://about.gitlab.com/jobs/all-jobs/") > scoreLink("https://gitlab.com/"));
  assert.ok(looksLikeHiringPage("https://about.gitlab.com/jobs/all-jobs/", "Jobs", ""));
});

test("footer and nav links are kept — careers often live there", () => {
  const page = cleanPage(
    "https://gitlab.com/",
    `<html><body>
      <nav><a href="https://about.gitlab.com/">About</a></nav>
      <footer><a href="https://about.gitlab.com/jobs/all-jobs/">Jobs</a></footer>
      <p>Product</p>
    </body></html>`,
  );
  assert.ok(page.links.some((href) => href.includes("about.gitlab.com")));
  assert.ok(page.links.some((href) => href.includes("/jobs/all-jobs")));
});
