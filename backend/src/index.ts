import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import { config } from "./config.js";
import { connectDb } from "./db.js";
import { authRouter } from "./routes/auth.js";
import { kitsRouter } from "./routes/kits.js";
import { practiceRouter } from "./routes/practice.js";

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(
  cors({
    origin: config.clientOrigin,
    credentials: true,
  }),
);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRouter);
app.use("/api/kits", kitsRouter);
app.use("/api/practice", practiceRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : "Unexpected server error";
  res.status(500).json({ error: { code: "SERVER_ERROR", message } });
});

await connectDb();
app.listen(config.port, () => {
  console.log(`API listening on ${config.port}`);
});
