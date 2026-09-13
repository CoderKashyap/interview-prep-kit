import { z } from "zod";
import type { Kit } from "./types.js";

const requirementSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  kind: z.enum(["technical", "behavioural", "domain"]),
  priority: z.enum(["must", "nice"]),
});

const questionSchema = z.object({
  id: z.string().min(1),
  requirement_ids: z.array(z.string()),
  category: z.enum(["technical", "behavioural", "system-design", "company-fit"]),
  prompt: z.string().min(1),
  answer_outline: z.string().min(1),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

const flashcardSchema = z.object({
  id: z.string().min(1),
  front: z.string().min(1),
  back: z.string().min(1),
  requirement_ids: z.array(z.string()),
});

const scheduleDaySchema = z.object({
  day: z.number().int().positive(),
  focus: z.string().min(1),
  question_ids: z.array(z.string()),
  minutes: z.number().int().nonnegative(),
});

export const kitSchema = z
  .object({
    source: z.object({
      company: z.string(),
      company_url: z.string(),
      role: z.string(),
      location: z.string(),
      jd_chars: z.number().int().nonnegative(),
      researched_at: z.string().min(1),
      pages_used: z.array(z.string()),
    }),
    company_brief: z.object({
      summary: z.string(),
      what_they_do: z.string(),
      sources: z.array(z.string()),
    }),
    role: z.object({
      title: z.string(),
      seniority: z.string(),
      responsibilities: z.array(z.string()),
      requirements: z.array(requirementSchema),
    }),
    questions: z.array(questionSchema),
    flashcards: z.array(flashcardSchema),
    schedule: z.object({
      days_available: z.number().int().positive(),
      days: z.array(scheduleDaySchema),
    }),
    coverage: z.object({
      uncovered_requirement_ids: z.array(z.string()),
      passes: z.number().int().nonnegative(),
    }),
  })
  .superRefine((kit, ctx) => {
    const questionIds = new Set(kit.questions.map((q) => q.id));
    const requirementIds = new Set(kit.role.requirements.map((r) => r.id));

    if (kit.schedule.days.length !== kit.schedule.days_available) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `schedule.days length (${kit.schedule.days.length}) must equal days_available (${kit.schedule.days_available})`,
        path: ["schedule", "days"],
      });
    }

    for (const [index, day] of kit.schedule.days.entries()) {
      if (day.day !== index + 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `schedule day at index ${index} must have day=${index + 1}`,
          path: ["schedule", "days", index, "day"],
        });
      }
      for (const qid of day.question_ids) {
        if (!questionIds.has(qid)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `schedule references missing question ${qid}`,
            path: ["schedule", "days", index, "question_ids"],
          });
        }
      }
    }

    for (const [index, question] of kit.questions.entries()) {
      for (const rid of question.requirement_ids) {
        if (!requirementIds.has(rid)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `question ${question.id} references unknown requirement ${rid}`,
            path: ["questions", index, "requirement_ids"],
          });
        }
      }
    }
  });

export function validateKit(value: unknown): Kit {
  return kitSchema.parse(value) as Kit;
}

export function safeValidateKit(value: unknown) {
  return kitSchema.safeParse(value);
}
