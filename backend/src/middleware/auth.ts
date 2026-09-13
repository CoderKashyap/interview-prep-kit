import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

export interface AuthPayload {
  userId: string;
  email: string;
}

export interface AuthedRequest extends Request {
  user?: AuthPayload;
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: "7d" });
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie("token", token, {
    httpOnly: true,
    sameSite: config.nodeEnv === "production" ? "none" : "lax",
    secure: config.nodeEnv === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  const token = bearer || req.cookies?.token;

  if (!token) {
    res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } });
    return;
  }

  try {
    req.user = jwt.verify(token, config.jwtSecret) as AuthPayload;
    next();
  } catch {
    res.status(401).json({ error: { code: "SESSION_EXPIRED", message: "Your session is no longer valid." } });
  }
}
