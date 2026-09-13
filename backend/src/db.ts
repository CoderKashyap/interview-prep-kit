import mongoose from "mongoose";
import { config } from "./config.js";

export async function connectDb(): Promise<void> {
  await mongoose.connect(config.mongoUri);
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}
