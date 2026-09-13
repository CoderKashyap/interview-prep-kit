import { Router } from "express";
import { z } from "zod";
import { KitModel } from "../models/Kit.js";
import { Practice } from "../models/Practice.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

export const practiceRouter = Router();
practiceRouter.use(requireAuth);

practiceRouter.get("/:kitId", async (req: AuthedRequest, res) => {
  const kit = await KitModel.findOne({ _id: req.params.kitId, userId: req.user!.userId });
  if (!kit?.kit) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Kit not ready." } });
    return;
  }
  const session = await Practice.findOne({ userId: req.user!.userId, kitId: kit._id });
  const latest = new Map<string, { confidence: number; seenAt: Date }>();
  for (const review of session?.reviews ?? []) {
    latest.set(review.flashcardId, { confidence: review.confidence, seenAt: review.seenAt });
  }

  const cards = kit.kit.flashcards
    .map((card) => ({
      ...card,
      confidence: latest.get(card.id)?.confidence ?? null,
      seenAt: latest.get(card.id)?.seenAt ?? null,
    }))
    .sort((a, b) => {
      const ac = a.confidence ?? 0;
      const bc = b.confidence ?? 0;
      if (ac !== bc) return ac - bc;
      return a.id.localeCompare(b.id);
    });

  res.json({
    cards,
    covered: cards.filter((c) => c.confidence !== null).length,
    total: cards.length,
  });
});

practiceRouter.post("/:kitId/review", async (req: AuthedRequest, res) => {
  const parsed = z.object({
    flashcardId: z.string(),
    confidence: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "INVALID_INPUT", message: "flashcardId and confidence (1-5) are required." } });
    return;
  }
  const kit = await KitModel.findOne({ _id: req.params.kitId, userId: req.user!.userId });
  if (!kit?.kit) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Kit not ready." } });
    return;
  }
  const exists = kit.kit.flashcards.some((card) => card.id === parsed.data.flashcardId);
  if (!exists) {
    res.status(400).json({ error: { code: "INVALID_INPUT", message: "Unknown flashcard." } });
    return;
  }

  const session = await Practice.findOneAndUpdate(
    { userId: req.user!.userId, kitId: kit._id },
    { $push: { reviews: { ...parsed.data, seenAt: new Date() } } },
    { upsert: true, new: true },
  );
  res.json({ ok: true, reviews: session?.reviews.length ?? 0 });
});

practiceRouter.get("/:kitId/weak-spots", async (req: AuthedRequest, res) => {
  const kit = await KitModel.findOne({ _id: req.params.kitId, userId: req.user!.userId });
  if (!kit?.kit) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Kit not ready." } });
    return;
  }
  const session = await Practice.findOne({ userId: req.user!.userId, kitId: kit._id });
  const latest = new Map<string, number>();
  for (const review of session?.reviews ?? []) {
    latest.set(review.flashcardId, review.confidence);
  }

  const weakCards = kit.kit.flashcards
    .filter((card) => (latest.get(card.id) ?? 0) > 0 && (latest.get(card.id) ?? 5) <= 2)
    .map((card) => ({
      id: card.id,
      front: card.front,
      confidence: latest.get(card.id),
      requirement_ids: card.requirement_ids,
    }));

  const uncoveredNice = kit.kit.role.requirements.filter(
    (req) => kit.kit!.coverage.uncovered_requirement_ids.includes(req.id) && req.priority === "nice",
  );

  const lowConfidenceReqs = new Set(weakCards.flatMap((card) => card.requirement_ids));
  const requirements = kit.kit.role.requirements.filter((req) => lowConfidenceReqs.has(req.id));

  res.json({
    weakCards,
    requirements,
    uncoveredNice,
    suggestion:
      weakCards.length === 0 && uncoveredNice.length === 0
        ? "No weak spots yet. Run a practice session — cards you mark 1 or 2 will show up here."
        : "Revisit these first tomorrow. Low-confidence cards beat unread bonus requirements.",
  });
});
