"use client";
// P3 Parnavi: events calendar + filters. Filters live in the URL (?q=&category=&freebie=&free=&day=).
import type { Event, EventCategory } from "@trojanhub/shared/types";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api";

import { CATEGORIES, CardSkeleton, EmptyState, ErrorState, EventCard, btn, dateParts, dayKey, relativeDay, useApi } from "./kit";

const DAYS = 7;

function nextDays(): string[] {
  return Array.from({ length: DAYS }, (_, i) => dayKey(new Date(Date.now() + i * 86_400_000)));
}

export function EventsBrowser() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const q = params.get("q") ?? "";
  const category = (params.get("category") as EventCategory | null) ?? undefined;
  const freebie = params.get("freebie") === "true" || undefined;
  const free = params.get("free") === "true" || undefined;
  const day = params.get("day") ?? "";

  // the search box follows ?q= (back button, shared links)
  const [search, setSearch] = useState(q);
  const [lastQ, setLastQ] = useState(q);
  if (q !== lastQ) {
    setLastQ(q);
    setSearch(q);
  }

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  }

  // debounce typing into ?q=
  useEffect(() => {
    if (search === q) return;
    const t = setTimeout(() => setParam("q", search.trim() || null), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const events = useApi(() => api.events.search({ q: q || undefined, category, freebie, free }), [q, category, freebie, free].join("|"));
  const days = useMemo(() => nextDays(), []);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of events.data?.events ?? []) c[dayKey(e.starts_at)] = (c[dayKey(e.starts_at)] ?? 0) + 1;
    return c;
  }, [events.data]);

  const groups = useMemo(() => {
    const list = (events.data?.events ?? []).filter((e) => !day || dayKey(e.starts_at) === day);
    const map = new Map<string, Event[]>();
    for (const e of list) map.set(dayKey(e.starts_at), [...(map.get(dayKey(e.starts_at)) ?? []), e]);
    return [...map.entries()];
  }, [events.data, day]);

  const anyFilter = q || category || freebie || free || day;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">Events</h1>
          <p className="text-muted">Org events, campus events, and everything that never made it to Engage.</p>
        </div>
        <Link href="/events/scan" className={btn.primary}>
          📸 Scan a flyer
        </Link>
      </header>

      <div className="space-y-3">
        <label className="relative block">
          <span className="sr-only">Search events</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search “pizza”, “career”, “Leavey”…"
            className="min-h-12 w-full rounded-full border border-line bg-surface pl-11 pr-4"
          />
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" aria-hidden>
            🔍
          </span>
        </label>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Filters">
          <Toggle on={!!freebie} onClick={() => setParam("freebie", freebie ? null : "true")}>
            🎁 Freebies
          </Toggle>
          <Toggle on={!!free} onClick={() => setParam("free", free ? null : "true")}>
            Free entry
          </Toggle>
          <span className="mx-1 w-px self-stretch bg-line" aria-hidden />
          {CATEGORIES.filter((c) => c.value !== "other").map((c) => (
            <Toggle key={c.value} on={category === c.value} onClick={() => setParam("category", category === c.value ? null : c.value)}>
              {c.emoji} {c.label}
            </Toggle>
          ))}
          {anyFilter && (
            <button onClick={() => router.replace(pathname, { scroll: false })} className="px-2 text-sm font-semibold text-cardinal hover:underline">
              Clear
            </button>
          )}
        </div>
      </div>

      <nav aria-label="Pick a day" className="grid grid-cols-4 gap-2 sm:grid-cols-8">
        <DayButton on={!day} onClick={() => setParam("day", null)} top="All" big="7d" count={events.data?.events.length} />
        {days.map((d) => {
          const p = dateParts(`${d}T20:00:00Z`);
          return (
            <DayButton key={d} on={day === d} onClick={() => setParam("day", day === d ? null : d)} top={d === days[0] ? "Today" : p.weekday} big={p.day} count={counts[d] ?? 0} />
          );
        })}
      </nav>

      {events.loading && !events.data && <CardSkeleton count={4} />}
      {events.error && <ErrorState message={events.error} onRetry={events.reload} />}
      {events.data && groups.length === 0 && (
        <EmptyState emoji="🔭" title="No events match">
          Try clearing a filter, or <Link href="/events/scan" className="font-semibold text-cardinal">add one from a flyer</Link>.
        </EmptyState>
      )}

      <div className="space-y-8">
        {groups.map(([key, list]) => (
          <section key={key} aria-label={relativeDay(list[0].starts_at)} className="space-y-3">
            <h2 className="sticky top-0 z-10 bg-background/95 py-1 text-sm font-bold uppercase tracking-wide text-muted backdrop-blur">
              {relativeDay(list[0].starts_at)} <span className="font-normal normal-case">· {list.length} event{list.length === 1 ? "" : "s"}</span>
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {list.map((e) => (
                <EventCard key={e.id} event={e} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`min-h-10 rounded-full border px-4 text-sm font-semibold transition ${on ? "border-cardinal bg-cardinal text-white" : "border-line bg-surface text-ink hover:border-ink"}`}
    >
      {children}
    </button>
  );
}

function DayButton({ on, onClick, top, big, count }: { on: boolean; onClick: () => void; top: string; big: string; count?: number }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`flex flex-col items-center rounded-2xl border py-2 transition ${on ? "border-cardinal bg-cardinal text-white" : "border-line bg-surface hover:border-ink"}`}
    >
      <span className={`text-[11px] font-semibold uppercase ${on ? "text-gold" : "text-muted"}`}>{top}</span>
      <span className="text-lg font-extrabold">{big}</span>
      <span className={`text-[11px] ${on ? "text-white/80" : "text-muted"}`}>{count ?? "–"}</span>
    </button>
  );
}
