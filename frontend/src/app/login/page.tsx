"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      await login(String(form.get("email")), String(form.get("password")));
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="page-wrap flex min-h-[70vh] items-center justify-center">
      <form onSubmit={onSubmit} className="card w-full max-w-md space-y-4 p-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-copper">Welcome back</p>
          <h1 className="font-serif text-3xl">Log in</h1>
        </div>
        <label className="block text-sm">
          Email
          <input className="field mt-1" name="email" type="email" required autoComplete="email" />
        </label>
        <label className="block text-sm">
          Password
          <input className="field mt-1" name="password" type="password" required autoComplete="current-password" />
        </label>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <button className="btn-primary w-full" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
        <p className="text-sm text-ink/70">
          No account? <Link href="/register" className="underline">Register</Link>
        </p>
      </form>
    </div>
  );
}
