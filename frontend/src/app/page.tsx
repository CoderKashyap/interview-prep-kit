"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { KitSummary } from "@/lib/types";

export default function DashboardPage() {
  const [kits, setKits] = useState<KitSummary[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const data = await api<{ kits: KitSummary[] }>("/api/kits");
        if (alive) setKits(data.kits);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Could not load kits.");
      }
    }
    load();
    const timer = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="page-wrap space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-copper">Your kits</p>
          <h1 className="font-serif text-4xl">Interview prep</h1>
          <p className="mt-2 max-w-xl text-sm text-ink/70">
            Paste a job description, give the company URL, and the pipeline researches and writes a kit you can edit and practise.
          </p>
        </div>
        <Link href="/kits/new" className="btn-primary">
          Create a kit
        </Link>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {kits.length === 0 ? (
        <div className="card p-8 text-sm text-ink/70">
          No kits yet. Create one from a pasted posting, or upload several description-and-company pairs.
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {kits.map((kit) => (
            <li key={kit.id} className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-copper">{kit.status}</p>
                  <h2 className="font-serif text-2xl">{kit.role || "Untitled role"}</h2>
                  <p className="text-sm text-ink/70">{kit.company || kit.input.company_url}</p>
                </div>
                <span className="text-xs text-ink/50">{kit.input.days} days</span>
              </div>
              {kit.status !== "ready" && kit.status !== "failed" ? (
                <div className="mt-4">
                  <div className="h-2 overflow-hidden rounded-full bg-rule">
                    <div className="h-full bg-copper" style={{ width: `${kit.progress.percent}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-ink/60">{kit.progress.message}</p>
                </div>
              ) : null}
              {kit.error ? <p className="mt-3 text-sm text-red-700">{kit.error.message}</p> : null}
              <div className="mt-4 flex gap-2">
                <Link href={`/kits/${kit.id}`} className="btn-ghost">
                  Open
                </Link>
                {kit.status === "ready" ? (
                  <Link href={`/kits/${kit.id}/practice`} className="btn-ghost">
                    Practise
                  </Link>
                ) : null}
                <button
                  className="btn-danger"
                  onClick={async () => {
                    await api(`/api/kits/${kit.id}`, { method: "DELETE" });
                    setKits((current) => current.filter((item) => item.id !== kit.id));
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
