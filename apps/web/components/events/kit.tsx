"use client";
// P3 Parnavi: shared pieces for the Home, Events, Deals and Rewards pages.
import type { Deal, Event, EventCategory } from "@trojanhub/shared/types";
import Link from "next/link";
import { useCallback, useEffect, useEffectEvent, useState } from "react";

import { api } from "@/lib/api";

// ---------------------------------------------------------------------------
// Time: stored UTC, always shown in Los Angeles time
// ---------------------------------------------------------------------------
const TZ = "America/Los_Angeles";
const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" });
const keyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const partsFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });

export const fmtTime = (iso: string) => timeFmt.format(new Date(iso));
export const dayKey = (iso: string | Date) => keyFmt.format(typeof iso === "string" ? new Date(iso) : iso);

export function relativeDay(iso: string): string {
  const key = dayKey(iso);
  const today = dayKey(new Date());
  const tomorrow = dayKey(new Date(Date.now() + 86_400_000));
  if (key === today) return "Today";
  if (key === tomorrow) return "Tomorrow";
  return dayFmt.format(new Date(iso));
}

export function timeRange(start: string, end: string | null): string {
  return end ? `${fmtTime(start)} – ${fmtTime(end)}` : fmtTime(start);
}

export function whenLabel(start: string, end: string | null): string {
  return `${relativeDay(start)} · ${timeRange(start, end)}`;
}

/** "in 25 min", "in 3 hr", "happening now", "ended" */
export function untilLabel(start: string, end: string | null = null): string {
  const now = Date.now();
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : s + 2 * 3_600_000;
  if (now >= s && now <= e) return "Happening now";
  if (now > e) return "Ended";
  const min = Math.round((s - now) / 60_000);
  if (min < 60) return `In ${min} min`;
  if (min < 24 * 60) return `In ${Math.round(min / 60)} hr`;
  return relativeDay(start);
}

/** Same window the API allows for "I'm here": 30 min before the start until 30 min after the end */
export function canCheckIn(start: string, end: string | null = null): boolean {
  const now = Date.now();
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : s + 2 * 3_600_000;
  return now >= s - 30 * 60_000 && now <= e + 30 * 60_000;
}

export function dateParts(iso: string): { weekday: string; day: string; month: string } {
  const parts =Object.fromEntries(partsFmt.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return { weekday: parts.weekday, day: parts.day, month: parts.month };
}

/** <input type="datetime-local"> value in LA time, and back to UTC ISO */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  // Find the UTC instant whose LA wall-clock equals `value` (handles PST/PDT)
  const guess = new Date(`${value}:00Z`);
  const shown = new Date(`${toLocalInput(guess.toISOString())}:00Z`);
  return new Date(guess.getTime() - (shown.getTime() - guess.getTime())).toISOString();
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------
/**
 * Load data for a page. `key` names the inputs (e.g. the search query); when it changes, it loads
 * again. Old data stays visible while new data loads, so lists don't flash empty.
 */
export function useApi<T>(load: () => Promise<T>, key = "") {
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<{ stamp: string; data?: T; error?: string }>({ stamp: "" });
  const stamp = `${key}#${nonce}`;
  const getLoad = useEffectEvent(() => load);

  useEffect(() => {
    let cancelled = false;
    getLoad()()
      .then((data) => !cancelled && setResult({ stamp, data }))
      .catch((e: unknown) => !cancelled && setResult((r) => ({ stamp, data: r.data, error: e instanceof Error ? e.message : String(e) })));
    return () => {
      cancelled = true;
    };
  }, [stamp]);

  const loading = result.stamp !== stamp;
  return {
    data: result.data,
    error: loading ? undefined : result.error,
    loading,
    reload: useCallback(() => setNonce((n) => n + 1), []),
    setData: (data: T) => setResult({ stamp, data }),
  };
}

/** `value`, but only after it stopped changing for `ms` (search boxes: one request per pause, not per key) */
export function useDebounced<T>(value: T, ms = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

/** Re-renders every `ms`, for things that change with the clock ("check-in is open") */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
export const CATEGORIES: { value: EventCategory; label: string; emoji: string }[] = [
  { value: "free_food", label: "Free food", emoji: "🍕" },
  { value: "cultural", label: "Cultural", emoji: "🪔" },
  { value: "career", label: "Career", emoji: "💼" },
  { value: "social", label: "Social", emoji: "🎉" },
  { value: "academic", label: "Academic", emoji: "📚" },
  { value: "sports", label: "Sports", emoji: "🏟️" },
  { value: "other", label: "Other", emoji: "✨" },
];
export const categoryInfo = (c: string) => CATEGORIES.find((x) => x.value === c) ?? CATEGORIES[CATEGORIES.length - 1];

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------
export const btn = {
  primary:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-cardinal px-5 font-semibold text-white transition hover:bg-cardinal-dark disabled:opacity-60",
  secondary:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line bg-surface px-5 font-semibold text-ink transition hover:border-ink disabled:opacity-60",
  ghost: "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 font-semibold text-cardinal hover:bg-cardinal/5",
};

export function Chip({ children, tone = "plain", title }: { children: React.ReactNode; tone?: "plain" | "gold" | "cardinal" | "green"; title?: string }) {
  const tones = {
    plain: "bg-background text-muted border border-line",
    gold: "bg-gold text-ink",
    cardinal: "bg-cardinal text-white",
    green: "bg-success/10 text-success",
  };
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Verified({ name }: { name?: string | null }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-cardinal" title="Verified student org">
      <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4 fill-cardinal">
        <path d="M10 1.5l2.2 1.6 2.7-.2.9 2.6 2.2 1.6-.9 2.6.9 2.6-2.2 1.6-.9 2.6-2.7-.2L10 18.5l-2.2-1.6-2.7.2-.9-2.6L2 12.9l.9-2.6L2 7.7l2.2-1.6.9-2.6 2.7.2z" />
        <path d="M8.6 12.6L6 10l1-1 1.6 1.6L13 6.2l1 1z" fill="#fff" />
      </svg>
      {name ?? "Verified"}
    </span>
  );
}

export function DateBlock({ iso }: { iso: string }) {
  const { weekday, day, month } = dateParts(iso);
  return (
    <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-cardinal/5 py-2 text-center" aria-hidden>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-cardinal">{weekday}</span>
      <span className="text-xl font-extrabold leading-tight text-ink">{day}</span>
      <span className="text-[11px] text-muted">{month}</span>
    </div>
  );
}

export function EventCard({ event, reason }: { event: Event; reason?: string }) {
  const cat = categoryInfo(event.category);
  const live = untilLabel(event.starts_at, event.ends_at);
  return (
    <Link
      href={`/events/${event.id}`}
      className="group flex gap-4 rounded-2xl border border-line bg-surface p-4 transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <DateBlock iso={event.starts_at} />
      <div className="min-w-0 flex-1 space-y-1.5">
        {reason && <p className="text-xs font-semibold text-cardinal">{reason}</p>}
        <h3 className="truncate text-base font-bold text-ink group-hover:text-cardinal">
          <span aria-hidden>{cat.emoji} </span>
          {event.title}
        </h3>
        <p className="truncate text-sm text-muted">
          {timeRange(event.starts_at, event.ends_at)}
          {event.location_text ? ` · ${event.location_text}` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {live === "Happening now" && <Chip tone="green">● Happening now</Chip>}
          {event.has_freebie && <Chip tone="gold">🎁 {event.freebie_desc ?? "Freebie"}</Chip>}
          {!event.is_free && <Chip>Ticketed</Chip>}
          {event.tickets_open_at && new Date(event.tickets_open_at) > new Date() && (
            <Chip tone="cardinal">Tickets {relativeDay(event.tickets_open_at).toLowerCase()} {fmtTime(event.tickets_open_at)}</Chip>
          )}
          {event.org_verified && <Verified name={event.org_name} />}
        </div>
      </div>
    </Link>
  );
}

export function DealCard({ deal, reason, onVoted }: { deal: Deal; reason?: string; onVoted?: (votes: number) => void }) {
  const [votes, setVotes] = useState(deal.still_active_votes);
  const [voted, setVoted] = useState<boolean | null>(null);
  const [openedAt] = useState(() => Date.now());
  const endsSoon = deal.expires_at && new Date(deal.expires_at).getTime() - openedAt < 12 * 3_600_000;

  async function vote(stillActive: boolean) {
    setVoted(stillActive);
    try {
      const res = await api.deals.vote(deal.id, stillActive);
      setVotes(res.still_active_votes);
      onVoted?.(res.still_active_votes);
    } catch {
      setVoted(null);
    }
  }

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl" aria-hidden>
          🎁
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          {reason && <p className="text-xs font-semibold text-cardinal">{reason}</p>}
          <h3 className="font-bold text-ink">{deal.title}</h3>
          {deal.description && <p className="text-sm text-muted">{deal.description}</p>}
          {deal.how_to_claim && (
            <p className="text-sm text-ink">
              <span className="font-semibold">How to claim:</span> {deal.how_to_claim}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {deal.kind === "one_time" ? <Chip tone={endsSoon ? "cardinal" : "gold"}>Limited time</Chip> : <Chip>Ongoing</Chip>}
        {deal.expires_at && <Chip>Ends {relativeDay(deal.expires_at).toLowerCase()} {fmtTime(deal.expires_at)}</Chip>}
        <div className="ml-auto flex items-center gap-1" role="group" aria-label="Does this deal still work?">
          <span className="mr-1 text-xs text-muted">{votes} say it works</span>
          <button
            onClick={() => vote(true)}
            aria-pressed={voted === true}
            aria-label="Still works"
            className={`flex h-9 w-9 items-center justify-center rounded-full border text-sm ${voted === true ? "border-success bg-success/10" : "border-line"}`}
          >
            👍
          </button>
          <button
            onClick={() => vote(false)}
            aria-pressed={voted === false}
            aria-label="Doesn't work anymore"
            className={`flex h-9 w-9 items-center justify-center rounded-full border text-sm ${voted === false ? "border-danger bg-danger/10" : "border-line"}`}
          >
            👎
          </button>
        </div>
      </div>
      {deal.link && (
        <a href={deal.link} target="_blank" rel="noreferrer" className="text-sm font-semibold text-cardinal hover:underline">
          Get the deal →
        </a>
      )}
    </article>
  );
}

export function CardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-busy aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex animate-pulse gap-4 rounded-2xl border border-line bg-surface p-4">
          <div className="h-16 w-14 rounded-xl bg-line" />
          <div className="flex-1 space-y-2 py-1">
            <div className="h-4 w-2/3 rounded bg-line" />
            <div className="h-3 w-1/2 rounded bg-line" />
            <div className="h-3 w-1/4 rounded bg-line" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ emoji, title, children }: { emoji: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-10 text-center">
      <p className="text-4xl" aria-hidden>
        {emoji}
      </p>
      <p className="mt-2 font-bold text-ink">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-danger/30 bg-danger/5 p-4 text-sm">
      <p className="font-semibold text-danger">Something went wrong</p>
      <p className="mt-1 text-muted">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-2 font-semibold text-cardinal hover:underline">
          Try again
        </button>
      )}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <h2 className="text-lg font-bold text-ink">{children}</h2>
      {action}
    </div>
  );
}
