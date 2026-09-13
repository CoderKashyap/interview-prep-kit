# Interview Prep Kit

A web app that turns a pasted job description, a company website, and the number of days until an interview into a personalised interview preparation kit.

The application researches the company itself: it crawls the site to learn what they do and how they hire, looks for public discussion of that interview process, then combines the findings with the posting. The result is a company brief, a role breakdown, a categorised question bank, flashcards, and a day-by-day schedule. The user can reshape any part of the kit and practise against it inside the app.

This repository is the Trao full-stack assessment (`FS-AI-INTERVIEW-01`).

## Tech stack

- **Frontend:** Next.js 15 (App Router) + Tailwind CSS + TypeScript
- **Backend:** Node.js + Express + TypeScript
- **Database:** MongoDB (Atlas free tier or local)
- **Shared pipeline:** a workspace package imported by both the API and the batch CLI
- **Scraping:** `fetch` + Cheerio, plus a small `robots.txt` reader
- **LLM:** Google Gemini 2.0 Flash on the free tier (`GEMINI_API_KEY`). Groq is a documented fallback.

The preferred stack from the brief is used as-is. TypeScript was chosen so Appendix A can be validated with Zod before a kit is saved or written to disk.

## Setup

```bash
cp .env.example .env
# set MONGODB_URI, JWT_SECRET, GEMINI_API_KEY
npm install
npm run dev:api
npm run dev:web
```

- API: http://localhost:4000
- Web: http://localhost:3000

Also copy `frontend/.env.local.example` to `frontend/.env.local` with `NEXT_PUBLIC_API_URL=http://localhost:4000`.

### Batch entry point (Section 9)

From a clean clone, after `npm install` and a filled `.env`:

```bash
npm run evaluate -- --input samples/cases.json --output samples/kits.json
```

The command reads `[{ id, jd, company_url, days }]`, runs the same `runPipeline` function the API uses, and writes Appendix B JSON. One failed case does not abort the run. Local company sites such as `http://localhost:8099/acme/` are allowed here, and relative links are followed.

### Tests

```bash
npm test
```

These cover schedule allocation, coverage checking, Appendix A structure validation, requirement extraction, and pin-safe regeneration.

## LLM

- Provider: Google Gemini
- Model: `gemini-2.0-flash` (override with `GEMINI_MODEL`)
- Fallback: Groq `llama-3.1-8b-instant` if `GROQ_API_KEY` is set and Gemini is not
- Free-tier rate limits are handled with exponential backoff and jitter. Invalid JSON is retried. If the model is unavailable, extraction and question generation fall back to deterministic helpers that only reuse text already in the posting — they do not invent requirements.

## Architecture

```
frontend/   Next.js UI (auth, create, progress, builder, practice, weak spots)
backend/    Express API, JWT sessions, kit jobs, practice reviews
pipeline/   retrieval, extraction, generation, coverage, schedule, evaluate CLI
```

Generation is a background job (`pending → researching → generating → checking → ready | failed`) so a long run or a double-submit does not block the API. Submitting the same description, company URL and day count returns the existing kit.

## Retrieval

1. Validate the company URL. Production rejects private and loopback hosts after DNS resolution. The evaluate CLI allows localhost.
2. Fetch the homepage. Skip and record 404s, timeouts, unexpected content types, and oversized bodies.
3. Honour `robots.txt` for our user agent.
4. Read links from the whole page, including nav and footer.
5. Rank links by hiring and about signals. Stay on the same company (`gitlab.com` and `about.gitlab.com` count as one) and follow that company's job-board host when the URL includes the company name. Paths are not hard-coded.
6. Crawl a second hop from about/jobs pages so a product homepage can still reach hiring content.
7. Search DuckDuckGo HTML for public interview discussion. If nothing useful is found, the kit says so.

Sources used: the company site the user supplied, pages linked from that site, and DuckDuckGo HTML search results. Job boards are never scraped.

## Research and generation sequence

Each step has one job. The kit is never produced by a single prompt.

| Step | Owner | Responsibility |
|---|---|---|
| Extract requirements | LLM, with a heuristic fallback | Must vs nice, kind, stable ids. Thin postings stay thin. Location and section titles are not requirements. |
| Fetch and clean a page | Code | HTML cleanup, size and type limits |
| Crawl and rank | Code | Discover about / hiring pages |
| Public discussion | Code | Search; skip quietly when empty |
| Company brief | LLM | Only from retrieved text |
| Questions | LLM, **four separate calls** | technical, behavioural, system-design, company-fit |
| Coverage check | **Code** | A requirement is covered only if a question lists its id |
| Second pass | LLM + code | Generate questions for uncovered **must** ids, then check again. Max 2 passes. |
| Flashcards | Code | Study prompts from covered requirements |
| Schedule | **Code** | Exact day count, integer minutes, must-haves earlier |

`failed` in batch output means we could not produce a kit at all. A missing hiring page or empty discussion is still `ok`.

## Generated, edited and pinned state

Stored next to the kit, not inside Appendix A:

- `origin`: `generated` | `user`
- `status`: `pristine` | `edited` | `pinned`

A question the user wrote is `user` + `pinned`. A generated question they edited becomes `edited`. Regenerating a category keeps those items and replaces only untouched generated ones. Regenerating the brief or the schedule does not rewrite questions.

Edits save on blur so typing does not wait on the network.

## Schedule allocation

Deterministic scoring: must-linked questions outrank nice-to-haves; higher difficulty is next. Earlier days receive the higher scores. Minutes come from difficulty (`15` / `25` / `40`) and are integers. 1-day and 60-day inputs still emit exactly that many days.

## Creative feature

**Weak spots** (`/kits/:id/weak-spots`): after practice, cards rated 1–2 and uncovered nice-to-have requirements are listed together. That answers “what should I study tomorrow?”, rather than adding a cosmetic extra.

## Design decisions and trade-offs

- Shared `pipeline` package so the UI and `npm run evaluate` cannot drift.
- Gemini Flash over a larger model so five cases can finish inside fifteen minutes on a free tier.
- Heuristic fallbacks after LLM retries: robustness points matter more than a prettier sentence.
- JWT in an httpOnly cookie **and** `Authorization: Bearer` so a separately hosted frontend can talk to the API.
- Coverage and schedule stay in code. The model is not asked to decide either.

## Known limitations

- DuckDuckGo HTML search is brittle and sometimes empty. The kit records “no public discussion” instead of inventing one.
- Some company sites are JS-only; we only read HTML.
- Free-tier token budgets can still stretch a five-case run if every page is huge. We truncate page text before prompting.
- There is no email verification or password reset (out of scope).

## Deployed setup

Free tiers are expected. Do not commit `.env`.

1. MongoDB Atlas — `MONGODB_URI` must start with `mongodb://` or `mongodb+srv://`.
2. Backend (Render or Railway) from the repo root. Build: `npm install --include=dev`. Start: `npm run start -w backend`. Do not run `tsc` on Render. Set `NODE_ENV=production`, `JWT_SECRET`, `GEMINI_API_KEY`, `CLIENT_ORIGIN` to the frontend URL, `ALLOW_PRIVATE_URLS=false`.
3. Frontend (Vercel), root directory `frontend`, `NEXT_PUBLIC_API_URL` set to the public API origin.
4. Confirm frontend and backend are both reachable.

`render.yaml` describes the API service.

## Environment variables

See [`.env.example`](.env.example).

| Name | Purpose |
|---|---|
| `MONGODB_URI` | Database |
| `JWT_SECRET` | Sign sessions |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | Primary LLM |
| `GROQ_API_KEY` / `GROQ_MODEL` | Optional fallback |
| `PORT` | API port (default 4000) |
| `NODE_ENV` | `development` or `production` |
| `CLIENT_ORIGIN` | Allowed frontend origin |
| `NEXT_PUBLIC_API_URL` | Frontend → API |
| `ALLOW_PRIVATE_URLS` | `false` in production |
