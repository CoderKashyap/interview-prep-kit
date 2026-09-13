import mongoose, { Schema } from "mongoose";

export interface CardReview {
  flashcardId: string;
  confidence: 1 | 2 | 3 | 4 | 5;
  seenAt: Date;
}

export interface PracticeDoc {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  kitId: mongoose.Types.ObjectId;
  reviews: CardReview[];
}

const practiceSchema = new Schema<PracticeDoc>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    kitId: { type: Schema.Types.ObjectId, required: true, index: true },
    reviews: [
      {
        flashcardId: String,
        confidence: { type: Number, min: 1, max: 5 },
        seenAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);

practiceSchema.index({ userId: 1, kitId: 1 }, { unique: true });

export const Practice = mongoose.model<PracticeDoc>("Practice", practiceSchema);
