"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { ItemState, KitPayload, KitRecord, Question } from "@/lib/types";

const CATEGORIES = ["technical", "behavioural", "system-design", "company-fit"] as const;

export default function KitBuilderPage() {
  const params = useParams<{ id: string }>();
  const [record, setRecord] = useState<KitRecord | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"brief" | "role" | "questions" | "flashcards" | "schedule">("brief");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const data = await api<{ kit: KitRecord }>(`/api/kits/${params.id}`);
    setRecord(data.kit);
  }, [params.id]);

  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        const data = await api<{ kit: KitRecord }>(`/api/kits/${params.id}`);
        if (alive) setRecord(data.kit);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Could not load kit.");
      }
    }
    tick();
    const timer = setInterval(tick, 2500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [params.id]);

  async function persist(nextKit: KitPayload, nextState: Record<string, ItemState>) {
    setSaving(true);
    try {
      const data = await api<{ kit: KitRecord }>(`/api/kits/${params.id}`, {
        method: "PATCH",
        body: JSON.stringify({ kit: nextKit, itemState: nextState }),
      });
      setRecord(data.kit);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function regenerate(section: string) {
    setSaving(true);
    try {
      const data = await api<{ kit: KitRecord }>(`/api/kits/${params.id}/regenerate`, {
        method: "POST",
        body: JSON.stringify({ section }),
      });
      setRecord(data.kit);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Regeneration failed.");
    } finally {
      setSaving(false);
    }
  }

  if (error && !record) {
    return <div className="page-wrap text-red-700">{error}</div>;
  }
  if (!record) {
    return <div className="page-wrap text-sm text-ink/60">Loading kit…</div>;
  }

  const generating = !["ready", "failed"].includes(record.status);

  return (
    <div className="page-wrap space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-copper">{record.status}</p>
          <h1 className="font-serif text-4xl">{record.kit?.role.title || "Generating kit"}</h1>
          <p className="text-sm text-ink/70">{record.input.company_url} · {record.input.days} days</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="btn-ghost" href={`/kits/${record.id}/practice`}>Practise</Link>
          <Link className="btn-ghost" href={`/kits/${record.id}/weak-spots`}>Weak spots</Link>
        </div>
      </div>

      {generating ? (
        <div className="card p-5">
          <div className="h-2 overflow-hidden rounded-full bg-rule">
            <div className="h-full bg-copper transition-all" style={{ width: `${record.progress.percent}%` }} />
          </div>
          <p className="mt-3 text-sm">{record.progress.message}</p>
          <p className="text-xs text-ink/50">Research, generation, coverage check and schedule are separate steps.</p>
        </div>
      ) : null}

      {record.status === "failed" ? (
        <div className="card border-red-200 p-5 text-red-800">
          {record.error?.message || "Generation failed."}
        </div>
      ) : null}

      {record.kit ? (
        <Builder
          record={record}
          tab={tab}
          setTab={setTab}
          persist={persist}
          regenerate={regenerate}
          saving={saving}
          reload={load}
        />
      ) : !generating && record.status !== "failed" ? (
        <div className="card p-6 text-sm text-ink/70">This kit has no content yet.</div>
      ) : null}
    </div>
  );
}

function Builder({
  record,
  tab,
  setTab,
  persist,
  regenerate,
  saving,
}: {
  record: KitRecord;
  tab: "brief" | "role" | "questions" | "flashcards" | "schedule";
  setTab: (tab: "brief" | "role" | "questions" | "flashcards" | "schedule") => void;
  persist: (kit: KitPayload, state: Record<string, ItemState>) => Promise<void>;
  regenerate: (section: string) => Promise<void>;
  saving: boolean;
  reload: () => Promise<void>;
}) {
  const kit = record.kit!;
  const questionsByCategory = useMemo(() => {
    return CATEGORIES.map((category) => ({
      category,
      items: kit.questions.filter((q) => q.category === category),
    }));
  }, [kit.questions]);

  function updateQuestion(id: string, patch: Partial<Question>) {
    const questions = kit.questions.map((q) => (q.id === id ? { ...q, ...patch } : q));
    const itemState = {
      ...record.itemState,
      [id]: {
        origin: record.itemState[id]?.origin ?? "generated",
        status: record.itemState[id]?.origin === "user" ? "pinned" as const : "edited" as const,
      },
    };
    void persist({ ...kit, questions }, itemState);
  }

  function moveQuestion(id: string, direction: -1 | 1) {
    const index = kit.questions.findIndex((q) => q.id === id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= kit.questions.length) return;
    const questions = [...kit.questions];
    const [item] = questions.splice(index, 1);
    questions.splice(next, 0, item);
    void persist({ ...kit, questions }, record.itemState);
  }

  function addQuestion(category: Question["category"]) {
    const id = `q${Date.now()}`;
    const questions = [
      ...kit.questions,
      {
        id,
        requirement_ids: kit.role.requirements[0] ? [kit.role.requirements[0].id] : [],
        category,
        prompt: "New question",
        answer_outline: "Write an answer outline",
        difficulty: 2 as const,
      },
    ];
    void persist({ ...kit, questions }, {
      ...record.itemState,
      [id]: { origin: "user", status: "pinned" },
    });
  }

  function deleteQuestion(id: string) {
    const questions = kit.questions.filter((q) => q.id !== id);
    const itemState = { ...record.itemState };
    delete itemState[id];
    void persist({ ...kit, questions }, itemState);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(["brief", "role", "questions", "flashcards", "schedule"] as const).map((name) => (
          <button key={name} className={tab === name ? "btn-primary" : "btn-ghost"} onClick={() => setTab(name)}>
            {name}
          </button>
        ))}
        <span className="self-center text-xs text-ink/50">{saving ? "Saving…" : "Edits save in the background"}</span>
      </div>

      {tab === "brief" ? (
        <section className="card space-y-4 p-5">
          <div className="flex justify-between gap-3">
            <h2 className="font-serif text-2xl">Company brief</h2>
            <button className="btn-ghost" onClick={() => regenerate("company_brief")}>Regenerate brief</button>
          </div>
          <label className="block text-sm">
            Summary
            <textarea
              className="field mt-1 min-h-28"
              defaultValue={kit.company_brief.summary}
              onBlur={(e) => void persist({ ...kit, company_brief: { ...kit.company_brief, summary: e.target.value } }, record.itemState)}
            />
          </label>
          <label className="block text-sm">
            What they do
            <textarea
              className="field mt-1 min-h-28"
              defaultValue={kit.company_brief.what_they_do}
              onBlur={(e) => void persist({ ...kit, company_brief: { ...kit.company_brief, what_they_do: e.target.value } }, record.itemState)}
            />
          </label>
          <p className="text-xs text-ink/50">Sources: {kit.company_brief.sources.join(" · ") || "none retrieved"}</p>
          {record.notes ? (
            <p className="text-xs text-ink/60">
              Hiring page: {record.notes.hiring_page_found ? "found" : "not found"}. Public discussion: {record.notes.discussion_found ? "found" : "none"}.
              {record.notes.thin_description ? " The posting was thin, so the kit stayed thin." : ""}
            </p>
          ) : null}
        </section>
      ) : null}

      {tab === "role" ? (
        <section className="card space-y-4 p-5">
          <h2 className="font-serif text-2xl">{kit.role.title}</h2>
          <p className="text-sm text-ink/70">{kit.role.seniority} {kit.source.location}</p>
          <ul className="space-y-2">
            {kit.role.requirements.map((req) => (
              <li key={req.id} className="rounded-xl border border-rule p-3 text-sm">
                <div className="flex gap-2 text-xs uppercase tracking-wide text-copper">
                  <span>{req.id}</span>
                  <span>{req.priority}</span>
                  <span>{req.kind}</span>
                </div>
                <p className="mt-1">{req.text}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tab === "questions" ? (
        <section className="space-y-5">
          {questionsByCategory.map(({ category, items }) => (
            <div key={category} className="card p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-serif text-2xl">{category}</h2>
                <div className="flex gap-2">
                  <button className="btn-ghost" onClick={() => addQuestion(category)}>Add</button>
                  <button className="btn-ghost" onClick={() => regenerate(category)}>Regenerate category</button>
                </div>
              </div>
              <p className="mb-3 text-xs text-ink/50">
                Edited and pinned questions survive regeneration. Untouched generated ones are replaced.
              </p>
              <ul className="space-y-3">
                {items.map((question) => {
                  const state = record.itemState[question.id];
                  return (
                    <li key={question.id} className="rounded-xl border border-rule p-3">
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-medium">{question.id}</span>
                        <span className="text-copper">{state?.status ?? "pristine"} · {state?.origin ?? "generated"}</span>
                        <select
                          className="field max-w-40"
                          value={question.category}
                          onChange={(e) => updateQuestion(question.id, { category: e.target.value as Question["category"] })}
                        >
                          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                        </select>
                        <button className="btn-ghost" onClick={() => moveQuestion(question.id, -1)}>Up</button>
                        <button className="btn-ghost" onClick={() => moveQuestion(question.id, 1)}>Down</button>
                        <button className="btn-danger" onClick={() => deleteQuestion(question.id)}>Delete</button>
                      </div>
                      <textarea
                        className="field min-h-20"
                        defaultValue={question.prompt}
                        onBlur={(e) => {
                          if (e.target.value !== question.prompt) updateQuestion(question.id, { prompt: e.target.value });
                        }}
                      />
                      <textarea
                        className="field mt-2 min-h-20"
                        defaultValue={question.answer_outline}
                        onBlur={(e) => {
                          if (e.target.value !== question.answer_outline) updateQuestion(question.id, { answer_outline: e.target.value });
                        }}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
      ) : null}

      {tab === "flashcards" ? (
        <section className="grid gap-3 md:grid-cols-2">
          {kit.flashcards.map((card) => (
            <article key={card.id} className="card p-4">
              <textarea
                className="field min-h-16"
                defaultValue={card.front}
                onBlur={(e) => {
                  const flashcards = kit.flashcards.map((f) => (f.id === card.id ? { ...f, front: e.target.value } : f));
                  void persist({ ...kit, flashcards }, {
                    ...record.itemState,
                    [card.id]: { origin: record.itemState[card.id]?.origin ?? "generated", status: "edited" },
                  });
                }}
              />
              <textarea
                className="field mt-2 min-h-20"
                defaultValue={card.back}
                onBlur={(e) => {
                  const flashcards = kit.flashcards.map((f) => (f.id === card.id ? { ...f, back: e.target.value } : f));
                  void persist({ ...kit, flashcards }, {
                    ...record.itemState,
                    [card.id]: { origin: record.itemState[card.id]?.origin ?? "generated", status: "edited" },
                  });
                }}
              />
            </article>
          ))}
        </section>
      ) : null}

      {tab === "schedule" ? (
        <section className="card space-y-4 p-5">
          <div className="flex justify-between">
            <h2 className="font-serif text-2xl">{kit.schedule.days_available} day plan</h2>
            <button className="btn-ghost" onClick={() => regenerate("schedule")}>Rebuild schedule</button>
          </div>
          <ol className="space-y-3">
            {kit.schedule.days.map((day) => (
              <li key={day.day} className="rounded-xl border border-rule p-3">
                <p className="text-sm font-medium">Day {day.day} · {day.focus} · {day.minutes} min</p>
                <p className="text-xs text-ink/60">{day.question_ids.join(", ") || "no questions"}</p>
              </li>
            ))}
          </ol>
          <p className="text-xs text-ink/50">
            Coverage pass {kit.coverage.passes}. Uncovered: {kit.coverage.uncovered_requirement_ids.join(", ") || "none"}.
          </p>
        </section>
      ) : null}
    </div>
  );
}
