import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { User } from "../models/User.js";
import { requireAuth, setAuthCookie, signToken, type AuthedRequest } from "../middleware/auth.js";

export const authRouter = Router();

const credentials = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
  name: z.string().min(1).max(80).optional(),
});

authRouter.post("/register", async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "INVALID_INPUT", message: "Provide a valid email and an 8+ character password." } });
    return;
  }
  const email = parsed.data.email.toLowerCase();
  const existing = await User.findOne({ email });
  if (existing) {
    res.status(409).json({ error: { code: "EMAIL_TAKEN", message: "An account with that email already exists." } });
    return;
  }
  const user = await User.create({
    email,
    name: parsed.data.name || email.split("@")[0],
    passwordHash: await bcrypt.hash(parsed.data.password, 10),
  });
  const token = signToken({ userId: String(user._id), email: user.email });
  setAuthCookie(res, token);
  res.status(201).json({ token, user: { id: user._id, email: user.email, name: user.name } });
});

authRouter.post("/login", async (req, res) => {
  const parsed = credentials.pick({ email: true, password: true }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "INVALID_INPUT", message: "Email and password are required." } });
    return;
  }
  const user = await User.findOne({ email: parsed.data.email.toLowerCase() });
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Email or password is wrong." } });
    return;
  }
  const token = signToken({ userId: String(user._id), email: user.email });
  setAuthCookie(res, token);
  res.json({ token, user: { id: user._id, email: user.email, name: user.name } });
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie("token", { path: "/" });
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const user = await User.findById(req.user!.userId).lean();
  if (!user) {
    res.status(401).json({ error: { code: "SESSION_EXPIRED", message: "Account no longer exists." } });
    return;
  }
  res.json({ user: { id: user._id, email: user.email, name: user.name } });
});
