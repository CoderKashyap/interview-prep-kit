import mongoose, { Schema } from "mongoose";
import type { Kit, KitItemState, PipelineProgress, ResearchNotes } from "pipeline";

export type KitStatus = "pending" | "researching" | "generating" | "checking" | "ready" | "failed";

export interface KitDoc {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  status: KitStatus;
  progress: PipelineProgress;
  input: { jd: string; company_url: string; days: number };
  inputHash: string;
  kit: Kit | null;
  itemState: KitItemState;
  notes: ResearchNotes | null;
  error: { code: string; message: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

const kitSchema = new Schema<KitDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: {
      type: String,
      enum: ["pending", "researching", "generating", "checking", "ready", "failed"],
      default: "pending",
    },
    progress: {
      step: { type: String, default: "queued" },
      message: { type: String, default: "Queued" },
      percent: { type: Number, default: 0 },
    },
    input: {
      jd: { type: String, required: true },
      company_url: { type: String, required: true },
      days: { type: Number, required: true },
    },
    inputHash: { type: String, required: true, index: true },
    kit: { type: Schema.Types.Mixed, default: null },
    itemState: { type: Schema.Types.Mixed, default: {} },
    notes: { type: Schema.Types.Mixed, default: null },
    error: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

kitSchema.index({ userId: 1, inputHash: 1 });

export const KitModel = mongoose.model<KitDoc>("Kit", kitSchema);
