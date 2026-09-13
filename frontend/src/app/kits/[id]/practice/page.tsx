"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

interface PracticeCard {
  id: string;
  front: string;
  back: string;
  requirement_ids: string[];
  confidence: number | null;
}

export default function PracticePage() {
  const params = useParams<{ id: string }>();
  const [cards, setCards] = useState<PracticeCard[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const data = await api<{ cards: PracticeCard[]; covered: number; total: number }>(`/api/practice/${params.id}`);
    setCards(data.cards);
  }, [params.id]);

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Could not load practice."));
  }, [load]);

  const card = cards[index];
  const covered = cards.filter((c) => c.confidence !== null).length;

  async function rate(confidence: 1 | 2 | 3 | 4 | 5) {
    if (!card) return;
    await api(`/api/practice/${params.id}/review`, {
      method: "POST",
      body: JSON.stringify({ flashcardId: card.id, confidence }),
    });
    setRevealed(false);
    setIndex((current) => Math.min(cards.length - 1, current + 1));
    await load();
  }

  if (error) return <div className="page-wrap text-red-700">{error}</div>;
  if (!card) {
    return (
      <div className="page-wrap space-y-4">
        <h1 className="font-serif text-4xl">Practice</h1>
        <p className="text-sm text-ink/70">No flashcards on this kit yet.</p>
        <Link className="btn-ghost" href={`/kits/${params.id}`}>Back to kit</Link>
      </div>
    );
  }

  return (
    <div className="page-wrap max-w-2xl space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-copper">Practice</p>
          <h1 className="font-serif text-4xl">Flashcards</h1>
          <p className="text-sm text-ink/60">{covered} of {cards.length} covered · next session starts with least confident</p>
        </div>
        <Link className="btn-ghost" href={`/kits/${params.id}`}>Back</Link>
      </div>

      <article className="card min-h-64 p-6">
        <p className="text-xs text-ink/50">{card.id} · {index + 1}/{cards.length}</p>
        <h2 className="mt-4 font-serif text-3xl">{card.front}</h2>
        {revealed ? <p className="mt-6 text-sm leading-6">{card.back}</p> : (
          <button className="btn-primary mt-8" onClick={() => setRevealed(true)}>Reveal answer</button>
        )}
      </article>

      {revealed ? (
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((score) => (
            <button key={score} className="btn-ghost" onClick={() => rate(score as 1 | 2 | 3 | 4 | 5)}>
              {score}
            </button>
          ))}
          <p className="self-center text-xs text-ink/50">1 = lost · 5 = locked in</p>
        </div>
      ) : null}

      <div className="flex gap-2">
        <button className="btn-ghost" onClick={() => { setIndex(Math.max(0, index - 1)); setRevealed(false); }}>Previous</button>
        <button className="btn-ghost" onClick={() => { setIndex(Math.min(cards.length - 1, index + 1)); setRevealed(false); }}>Skip</button>
      </div>
    </div>
  );
}
