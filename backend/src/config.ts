import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), "../.env") });
loadEnv();

function mongoUri(): string {
  let value = (process.env.MONGODB_URI || "").trim();
  if (value.startsWith("MONGODB_URI=")) value = value.slice("MONGODB_URI=".length).trim();
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value || "mongodb://127.0.0.1:27017/interview_prep_kit";
}

export const config = {
  port: Number(process.env.PORT || 4000),
  mongoUri: mongoUri(),
  jwtSecret: process.env.JWT_SECRET || "dev-only-change-me",
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:3000",
  nodeEnv: process.env.NODE_ENV || "development",
  allowPrivateUrls: process.env.ALLOW_PRIVATE_URLS === "true" || process.env.NODE_ENV !== "production",
};
