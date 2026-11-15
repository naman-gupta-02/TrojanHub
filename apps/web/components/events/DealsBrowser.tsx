"use client";
// P3 Parnavi: Deals & Freebies. One-time freebies first (ending soonest), then ongoing student deals.
import Link from "next/link";
import { useState } from "react";

import { api } from "@/lib/api";

import { CardSkeleton, DealCard, EmptyState, ErrorState, SectionTitle, btn, useApi } from "./kit";

type Tab = "all" | "one_time" | "ongoing";

export function DealsBrowser() {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const deals = useApi(() => api.deals.search({ q: q || undefined, active: true }), q);

  const list = (deals.data?.deals ?? []).filter((d) => tab === "all" || d.kind === tab);
  const oneTime = list.filter((d) => d.kind === "one_time");
  const ongoing = list.filter((d) => d.kind === "ongoing");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">Deals &amp; Freebies</h1>
          <p className="text-muted">Student offers and free stuff, voted on by Trojans so expired deals drop off.</p>
        </div>
        <Link href="/events/scan" className={btn.primary}>
          🎁 Post a deal
        </Link>
      </header>

      <div className="flex flex-wrap gap-3">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search deals</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search “boba”, “movie”, “bike”…"
            className="min-h-12 w-full rounded-full border border-line bg-surface pl-11 pr-4"
          />
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" aria-hidden>
            🔍
          </span>
        </label>
        <div className="flex rounded-full border border-line bg-surface p-1" role="radiogroup" aria-label="Deal type">
          {(
            [
              ["all", "All"],
              ["one_time", "🎁 Freebies"],
              ["ongoing", "Ongoing"],
            ] as [Tab, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              role="radio"
              aria-checked={tab === value}
              onClick={() => setTab(value)}
              className={`min-h-10 rounded-full px-4 text-sm font-semibold ${tab === value ? "bg-cardinal text-white" : "text-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {deals.loading && !deals.data && <CardSkeleton />}
      {deals.error && <ErrorState message={deals.error} onRetry={deals.reload} />}
      {deals.data && list.length === 0 && (
        <EmptyState emoji="🛍️" title="No deals match">
          Know one? <Link href="/events/scan" className="font-semibold text-cardinal">Post it</Link> and help a Trojan out.
        </EmptyState>
      )}

      {oneTime.length > 0 && (
        <section className="space-y-3">
          <SectionTitle>🎁 Limited-time freebies</SectionTitle>
          <div className="grid gap-3 md:grid-cols-2">
            {oneTime.map((d) => (
              <DealCard key={d.id} deal={d} />
            ))}
          </div>
        </section>
      )}
      {ongoing.length > 0 && (
        <section className="space-y-3">
          <SectionTitle>Ongoing student deals</SectionTitle>
          <div className="grid gap-3 md:grid-cols-2">
            {ongoing.map((d) => (
              <DealCard key={d.id} deal={d} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
