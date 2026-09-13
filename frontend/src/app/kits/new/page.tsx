"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { api } from "@/lib/api";
import type { KitRecord } from "@/lib/types";

function parseBatch(text: string): Array<{ jd: string; company_url: string; days: number }> {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed) as Array<{ jd?: string; company_url?: string; days?: number }>;
    return parsed.map((item) => ({
      jd: item.jd ?? "",
      company_url: item.company_url ?? "",
      days: Number(item.days || 5),
    }));
  }
  return trimmed
    .split(/\n+/)
    .map((line) => line.split("\t"))
    .filter((parts) => parts.length >= 2)
    .map((parts) => ({
      jd: parts[0],
      company_url: parts[1],
      days: Number(parts[2] || 5),
    }));
}

export default function NewKitPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [mode, setMode] = useState<"single" | "batch">("single");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      if (mode === "single") {
        const data = await api<{ kit: KitRecord }>("/api/kits", {
          method: "POST",
          body: JSON.stringify({
            jd: form.get("jd"),
            company_url: form.get("company_url"),
            days: Number(form.get("days")),
          }),
        });
        router.push(`/kits/${data.kit.id}`);
        return;
      }
      const cases = parseBatch(String(form.get("batch") || ""));
      if (cases.length === 0) throw new Error("Could not parse any description-and-company pairs.");
      const data = await api<{ kits: KitRecord[] }>("/api/kits/batch", {
        method: "POST",
        body: JSON.stringify({ cases }),
      });
      router.push(`/kits/${data.kits[0].id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start generation.");
      setPending(false);
    }
  }

  return (
    <div className="page-wrap max-w-3xl space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-copper">Section 2</p>
        <h1 className="font-serif text-4xl">Create a kit</h1>
        <p className="mt-2 text-sm text-ink/70">
          Paste the posting as text. We crawl the company site ourselves — we do not scrape job boards.
        </p>
      </div>

      <div className="flex gap-2">
        <button className={mode === "single" ? "btn-primary" : "btn-ghost"} onClick={() => setMode("single")} disabled={pending}>
          One role
        </button>
        <button className={mode === "batch" ? "btn-primary" : "btn-ghost"} onClick={() => setMode("batch")} disabled={pending}>
          Several roles
        </button>
      </div>

      <form onSubmit={onSubmit} className="card space-y-4 p-6">
        {mode === "single" ? (
          <>
            <label className="block text-sm">
              Job description
              <textarea className="field mt-1 min-h-48" name="jd" required placeholder="Paste the posting here" disabled={pending} />
            </label>
            <label className="block text-sm">
              Company website
              <input className="field mt-1" name="company_url" required placeholder="https://company.com" disabled={pending} />
            </label>
            <label className="block text-sm">
              Days until the interview
              <input className="field mt-1 max-w-32" name="days" type="number" min={1} max={60} defaultValue={5} disabled={pending} />
            </label>
          </>
        ) : (
          <label className="block text-sm">
            JSON array or tab-separated lines: description, company URL, days
            <textarea
              className="field mt-1 min-h-48 font-mono text-xs"
              name="batch"
              disabled={pending}
              placeholder='[{"jd":"...","company_url":"https://...","days":5}]'
            />
          </label>
        )}
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <button className="btn-primary" disabled={pending} aria-busy={pending}>
          {pending ? "Generating" : "Generate kit"}
        </button>
        {pending ? (
          <p className="text-xs text-ink/60">Working — you can watch progress on the next screen.</p>
        ) : null}
      </form>
    </div>
  );
}
