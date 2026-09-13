"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Requirement } from "@/lib/types";

interface Report {
  weakCards: Array<{ id: string; front: string; confidence?: number; requirement_ids: string[] }>;
  requirements: Requirement[];
  uncoveredNice: Requirement[];
  suggestion: string;
}

export default function WeakSpotsPage() {
  const params = useParams<{ id: string }>();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Report>(`/api/practice/${params.id}/weak-spots`)
      .then(setReport)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load report."));
  }, [params.id]);

  return (
    <div className="page-wrap max-w-3xl space-y-5">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-copper">Creative feature</p>
        <h1 className="font-serif text-4xl">Weak spots</h1>
        <p className="mt-2 text-sm text-ink/70">
          Cards you marked 1–2, plus nice-to-have requirements the kit never covered.
        </p>
      </div>
      {error ? <p className="text-red-700">{error}</p> : null}
      {report ? (
        <div className="card space-y-4 p-6">
          <p>{report.suggestion}</p>
          <div>
            <h2 className="font-serif text-2xl">Low confidence</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {report.weakCards.length === 0 ? <li>None yet.</li> : report.weakCards.map((card) => (
                <li key={card.id} className="rounded-xl border border-rule p-3">
                  {card.front} <span className="text-copper">({card.confidence})</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="font-serif text-2xl">Related requirements</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {report.requirements.map((req) => (
                <li key={req.id}>{req.id}: {req.text}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="font-serif text-2xl">Uncovered nice-to-haves</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {report.uncoveredNice.length === 0 ? <li>None.</li> : report.uncoveredNice.map((req) => (
                <li key={req.id}>{req.id}: {req.text}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
      <Link className="btn-ghost" href={`/kits/${params.id}/practice`}>Back to practice</Link>
    </div>
  );
}
