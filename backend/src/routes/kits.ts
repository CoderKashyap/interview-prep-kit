import { Router } from "express";
import { z } from "zod";
import {
  applyCoverage,
  applySchedule,
  generateQuestionsForCategory,
  generateCompanyBrief,
  validateKit,
  type Kit,
  type Question,
} from "pipeline";
import { KitModel } from "../models/Kit.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { hashInput, startGeneration } from "../jobs/generateKit.js";

export const kitsRouter = Router();
kitsRouter.use(requireAuth);

const createSchema = z.object({
  jd: z.string().min(1),
  company_url: z.string().min(3),
  days: z.coerce.number().int().min(1).max(60),
  reuse: z.boolean().optional(),
});

function owned(req: AuthedRequest) {
  return { userId: req.user!.userId };
}

kitsRouter.get("/", async (req: AuthedRequest, res) => {
  const kits = await KitModel.find(owned(req)).sort({ updatedAt: -1 }).lean();
  res.json({
    kits: kits.map((kit) => ({
      id: kit._id,
      status: kit.status,
      progress: kit.progress,
      input: { company_url: kit.input.company_url, days: kit.input.days, jd_chars: kit.input.jd.length },
      role: kit.kit?.role.title ?? "",
      company: kit.kit?.source.company ?? "",
      error: kit.error,
      updatedAt: kit.updatedAt,
    })),
  });
});

kitsRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "INVALID_INPUT", message: "Provide a job description, company URL, and days (1-60)." } });
    return;
  }

  const inputHash = hashInput(parsed.data.jd, parsed.data.company_url, parsed.data.days);
  const existing = await KitModel.findOne({ userId: req.user!.userId, inputHash });
  if (existing && parsed.data.reuse !== false) {
    res.status(200).json({ kit: serialize(existing), reused: true });
    return;
  }

  const doc = await KitModel.create({
    userId: req.user!.userId,
    status: "pending",
    input: {
      jd: parsed.data.jd,
      company_url: parsed.data.company_url,
      days: parsed.data.days,
    },
    inputHash,
    kit: null,
    itemState: {},
    notes: null,
    error: null,
  });
  startGeneration(String(doc._id));
  res.status(202).json({ kit: serialize(doc), reused: false });
});

kitsRouter.post("/batch", async (req: AuthedRequest, res) => {
  const parsed = z.object({
    cases: z.array(createSchema.omit({ reuse: true })).min(1).max(20),
  }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "INVALID_INPUT", message: "Upload an array of description-and-company pairs." } });
    return;
  }
  const created = [];
  for (const item of parsed.data.cases) {
    const inputHash = hashInput(item.jd, item.company_url, item.days);
    const doc = await KitModel.create({
      userId: req.user!.userId,
      status: "pending",
      input: item,
      inputHash,
      kit: null,
      itemState: {},
    });
    startGeneration(String(doc._id));
    created.push(serialize(doc));
  }
  res.status(202).json({ kits: created });
});

kitsRouter.get("/:id", async (req: AuthedRequest, res) => {
  const doc = await KitModel.findOne({ _id: req.params.id, ...owned(req) });
  if (!doc) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Kit not found." } });
    return;
  }
  res.json({ kit: serialize(doc) });
});

kitsRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const doc = await KitModel.findOneAndDelete({ _id: req.params.id, ...owned(req) });
  if (!doc) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Kit not found." } });
    return;
  }
  res.json({ ok: true });
});

const patchSchema = z.object({
  kit: z.any().optional(),
  itemState: z.record(z.object({
    origin: z.enum(["generated", "user"]),
    status: z.enum(["pristine", "edited", "pinned"]),
  })).optional(),
});

kitsRouter.patch("/:id", async (req: AuthedRequest, res) => {
  const doc = await KitModel.findOne({ _id: req.params.id, ...owned(req) });
  if (!doc || !doc.kit) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Kit not found or still generating." } });
    return;
  }
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "INVALID_INPUT", message: "Invalid kit patch." } });
    return;
  }
  if (parsed.data.kit) {
    try {
      doc.kit = validateKit(parsed.data.kit);
    } catch {
      res.status(400).json({ error: { code: "INVALID_KIT", message: "Patched kit failed structure validation." } });
      return;
    }
  }
  if (parsed.data.itemState) {
    doc.itemState = parsed.data.itemState;
  }
  await doc.save();
  res.json({ kit: serialize(doc) });
});

kitsRouter.post("/:id/regenerate", async (req: AuthedRequest, res) => {
  const doc = await KitModel.findOne({ _id: req.params.id, ...owned(req) });
  if (!doc?.kit) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Kit not found or still generating." } });
    return;
  }

  const body = z.object({
    section: z.enum(["company_brief", "schedule", "technical", "behavioural", "system-design", "company-fit"]),
  }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: { code: "INVALID_INPUT", message: "Choose a section to regenerate." } });
    return;
  }

  const kit = doc.kit as Kit;
  const section = body.data.section;

  if (section === "schedule") {
    doc.kit = applySchedule(kit, kit.schedule.days_available);
  } else if (section === "company_brief") {
    const brief = await generateCompanyBrief({
      companyName: kit.source.company,
      companyUrl: kit.source.company_url,
      pages: [{ url: kit.source.company_url, title: "", text: `${kit.company_brief.summary} ${kit.company_brief.what_they_do}`, links: [], contentType: "text/plain" }],
      discussionSnippets: [],
    });
    doc.kit = { ...kit, company_brief: brief };
  } else {
    const kept = kit.questions.filter((question) => {
      if (question.category !== section) return true;
      const state = doc.itemState[question.id];
      return Boolean(state && (state.origin === "user" || state.status === "edited" || state.status === "pinned"));
    });
    const generated = await generateQuestionsForCategory({
      category: section,
      requirements: kit.role.requirements,
      roleTitle: kit.role.title,
      companyBrief: kit.company_brief.summary,
      hiringNotes: "User asked to regenerate this category. Preserve nothing from previous generated items.",
      existingQuestionIds: kept.map((q) => q.id),
    });
    const merged: Question[] = [...kept, ...generated];
    for (const question of generated) {
      doc.itemState[question.id] = { origin: "generated", status: "pristine" };
    }
    let next = { ...kit, questions: merged };
    next = applyCoverage(next, next.coverage.passes);
    next = applySchedule(next, next.schedule.days_available);
    doc.kit = validateKit(next);
    doc.markModified("itemState");
  }

  await doc.save();
  res.json({ kit: serialize(doc) });
});

function serialize(doc: { toObject?: () => unknown }) {
  const raw = (typeof doc.toObject === "function" ? doc.toObject() : doc) as {
    _id: unknown;
    status: unknown;
    progress: unknown;
    input: unknown;
    kit: unknown;
    itemState: unknown;
    notes: unknown;
    error: unknown;
    createdAt: unknown;
    updatedAt: unknown;
  };
  return {
    id: raw._id,
    status: raw.status,
    progress: raw.progress,
    input: raw.input,
    kit: raw.kit,
    itemState: raw.itemState,
    notes: raw.notes,
    error: raw.error,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}
