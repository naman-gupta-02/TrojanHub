"use client";
// P3 Parnavi: attendance rewards. "3 of 5 career events", which upcoming events count, link to the official rules.
import type { RewardProgress } from "@trojanhub/shared/types";
import Link from "next/link";

import { api } from "@/lib/api";

import { CardSkeleton, EmptyState, ErrorState, EventCard, useApi } from "./kit";

export function RewardsBoard() {
  const rewards = useApi(() => api.rewards.progress());

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-extrabold">Rewards</h1>
        <p className="text-muted">Some offices give perks for showing up. Check in at events and watch your progress fill up.</p>
      </header>

      {rewards.loading && !rewards.data && <CardSkeleton count={2} />}
      {rewards.error && <ErrorState message={rewards.error} onRetry={rewards.reload} />}
      {rewards.data && rewards.data.length === 0 && <EmptyState emoji="🏆" title="No reward programs yet" />}

      <div className="space-y-6">{rewards.data?.map((p) => <ProgramCard key={p.program.id} p={p} />)}</div>

      <p className="text-xs text-muted">
        Progress here is tracked by TrojanHub check-ins. Each office&apos;s official page has the real rules and how to claim.
      </p>
    </div>
  );
}

function ProgramCard({ p }: { p: RewardProgress }) {
  const done = p.attended >= p.required;
  const left = Math.max(p.required - p.attended, 0);
  return (
    <section className="overflow-hidden rounded-3xl border border-line bg-surface" aria-labelledby={`prog-${p.program.id}`}>
      <div className={`p-6 ${done ? "bg-gold" : "bg-cardinal text-white"}`}>
        <p className={`text-xs font-semibold uppercase tracking-wide ${done ? "text-ink/70" : "text-gold"}`}>{p.program.office}</p>
        <h2 id={`prog-${p.program.id}`} className="mt-1 text-2xl font-extrabold">
          {p.program.name}
        </h2>
        {p.program.reward_desc && <p className={`mt-1 text-sm ${done ? "text-ink/80" : "text-white/80"}`}>{p.program.reward_desc}</p>}

        <div className="mt-5 flex items-center gap-4">
          <div className="flex gap-1.5" role="progressbar" aria-valuenow={p.attended} aria-valuemin={0} aria-valuemax={p.required} aria-label={`${p.attended} of ${p.required} events attended`}>
            {Array.from({ length: p.required }, (_, i) => (
              <span
                key={i}
                className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${
                  i < p.attended ? (done ? "bg-ink text-gold" : "bg-gold text-ink") : done ? "bg-ink/10" : "border-2 border-white/40"
                }`}
                aria-hidden
              >
                {i < p.attended ? "✓" : ""}
              </span>
            ))}
          </div>
          <p className="text-lg font-bold">
            {done ? "🎉 Complete!" : (
              <>
                {p.attended} of {p.required} <span className={`text-sm font-normal ${done ? "" : "text-white/80"}`}>· {left} to go</span>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="space-y-3 p-6">
        {done ? (
          <p className="text-sm">
            You did it. Head to {p.program.office} to claim your reward.{" "}
            {p.program.rules_url && (
              <a href={p.program.rules_url} target="_blank" rel="noreferrer" className="font-semibold text-cardinal hover:underline">
                How to claim ↗
              </a>
            )}
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h3 className="font-bold">Events that count</h3>
              {p.program.rules_url && (
                <a href={p.program.rules_url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-cardinal hover:underline">
                  Official rules ↗
                </a>
              )}
            </div>
            {p.next_eligible_events.length === 0 ? (
              <p className="text-sm text-muted">Nothing scheduled yet. Check back soon.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {p.next_eligible_events.map((e, i) => (
                  <EventCard key={e.id} event={e} reason={i === 0 && left === 1 ? "This one completes it!" : undefined} />
                ))}
              </div>
            )}
          </>
        )}
        <Link href="/events?category=career" className="inline-block text-sm font-semibold text-cardinal hover:underline">
          Browse all career events →
        </Link>
      </div>
    </section>
  );
}
