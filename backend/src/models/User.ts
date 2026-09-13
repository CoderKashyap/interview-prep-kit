import mongoose, { Schema } from "mongoose";

export interface UserDoc {
  _id: mongoose.Types.ObjectId;
  email: string;
  passwordHash: string;
  name: string;
  createdAt: Date;
}

const userSchema = new Schema<UserDoc>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
  },
  { timestamps: true },
);

export const User = mongoose.model<UserDoc>("User", userSchema);
