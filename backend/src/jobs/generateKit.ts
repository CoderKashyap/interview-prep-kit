import { createHash } from "node:crypto";
import { ZodError } from "zod";
import { PipelineError, runPipeline } from "pipeline";
import { config } from "../config.js";
import { KitModel } from "../models/Kit.js";

const running = new Set<string>();

export function hashInput(jd: string, companyUrl: string, days: number): string {
  return createHash("sha256").update(`${jd.trim()}\n${companyUrl.trim()}\n${days}`).digest("hex");
}

export function startGeneration(kitId: string): void {
  if (running.has(kitId)) return;
  running.add(kitId);
  void runJob(kitId).finally(() => running.delete(kitId));
}

async function runJob(kitId: string): Promise<void> {
  const doc = await KitModel.findById(kitId);
  if (!doc) return;

  try {
    await KitModel.findByIdAndUpdate(kitId, {
      status: "researching",
      progress: { step: "start", message: "Starting research", percent: 2 },
      error: null,
    });

    const result = await runPipeline({
      jd: doc.input.jd,
      company_url: doc.input.company_url,
      days: doc.input.days,
      allowPrivateUrls: config.allowPrivateUrls,
      onProgress: (event) => {
        const status =
          event.step === "coverage" || event.step === "second-pass" || event.step === "schedule"
            ? "checking"
            : event.step === "ready"
              ? "ready"
              : ["extract", "crawl", "discussion"].includes(event.step)
                ? "researching"
                : "generating";
        void KitModel.findByIdAndUpdate(kitId, { status, progress: event });
      },
    });

    await KitModel.findByIdAndUpdate(kitId, {
      status: "ready",
      kit: result.kit,
      itemState: result.itemState,
      notes: result.notes,
      progress: { step: "ready", message: "Kit ready", percent: 100 },
      error: null,
    });
  } catch (error) {
    const code = error instanceof PipelineError ? error.code : "PIPELINE_FAILED";
    const message =
      error instanceof ZodError
        ? "The model returned a kit that failed structure checks. Try generating again."
        : error instanceof Error
          ? error.message
          : "Generation failed.";
    await KitModel.findByIdAndUpdate(kitId, {
      status: "failed",
      error: { code, message },
      progress: { step: "failed", message, percent: 100 },
    });
  }
}
