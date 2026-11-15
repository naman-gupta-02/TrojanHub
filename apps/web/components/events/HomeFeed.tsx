"use client";
// P3 Parnavi: home feed ("3 things for you today", free today, your next events, rewards teaser, freebie alerts).
import type { FeedItem, NotifyCategory, NotifyPrefs } from "@trojanhub/shared/types";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

import { api } from "@/lib/api";

import {
  CATEGORIES,
  CardSkeleton,
  DealCard,
  EmptyState,
  ErrorState,
  EventCard,
  SectionTitle,
  btn,
  errorMessage,
  fmtTime,
  untilLabel,
  useApi,
} from "./kit";

const noSubscribe = () => () => {};
const laHour = () => Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hourCycle: "h23" }).format(new Date()));

/** Time-of-day greeting. Read in the browser only; the server renders a neutral "Hello". */
function useGreeting(): string {
  const h = useSyncExternalStore(noSubscribe, laHour, () => null);
  if (h === null) return "Hello";
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function FeedCard({ item }: { item: FeedItem }) {
  return item.kind === "event" ? <EventCard event={item.event} reason={item.reason} /> : <DealCard deal={item.deal} reason={item.reason} />;
}

export function HomeFeed() {
  const greeting = useGreeting();
  const feed = useApi(() => api.feed());
  const mine = useApi(() => api.events.mine());
  const rewards = useApi(() => api.rewards.progress());

  const freeEvents = feed.data?.today_freebies.filter((i) => i.kind === "event") ?? [];
  const freeDeals = feed.data?.today_freebies.filter((i) => i.kind === "deal") ?? [];
  const next = mine.data?.saved.filter((s) => untilLabel(s.event.starts_at, s.event.ends_at) !== "Ended").slice(0, 3) ?? [];
  const closest = rewards.data?.filter((p) => p.attended < p.required).sort((a, b) => b.attended / b.required - a.attended / a.required)[0];

  return (
    <div className="space-y-10">
      <header className="overflow-hidden rounded-3xl bg-cardinal p-6 text-white sm:p-8">
        <p className="text-sm font-semibold text-gold">{greeting}, Trojan</p>
        <h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">Here&apos;s your day on campus</h1>
        <p className="mt-2 max-w-xl text-white/80">
          {feed.data
            ? `${freeEvents.length} free event${freeEvents.length === 1 ? "" : "s"} and ${freeDeals.length} limited-time deal${freeDeals.length === 1 ? "" : "s"} today.`
            : "Picking the best things happening around you…"}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/events/scan" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-gold px-5 font-semibold text-ink">
            📸 Scan a flyer
          </Link>
          <Link href="/events?freebie=true" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/40 px-5 font-semibold">
            Everything free today
          </Link>
        </div>
      </header>

      <section className="space-y-3" aria-labelledby="for-you">
        <SectionTitle>
          <span id="for-you">3 things for you today</span>
        </SectionTitle>
        {feed.loading && !feed.data && <CardSkeleton />}
        {feed.error && <ErrorState message={feed.error} onRetry={feed.reload} />}
        {feed.data && feed.data.for_you.length === 0 && (
          <EmptyState emoji="🌤️" title="A quiet day so far">
            Check back later, or <Link className="font-semibold text-cardinal" href="/events/scan">post a flyer</Link> you saw.
          </EmptyState>
        )}
        <div className="grid gap-3 lg:grid-cols-3">
          {feed.data?.for_you.map((item) => <FeedCard key={item.kind === "event" ? item.event.id : item.deal.id} item={item} />)}
        </div>
      </section>

      <div className="grid gap-10 lg:grid-cols-[2fr_1fr]">
        <section className="space-y-3" aria-labelledby="free-today">
          <SectionTitle action={<Link href="/events?freebie=true" className="text-sm font-semibold text-cardinal">See all →</Link>}>
            <span id="free-today">🎁 Free today</span>
          </SectionTitle>
          {feed.loading && !feed.data && <CardSkeleton count={2} />}
          {feed.data && feed.data.today_freebies.length === 0 && <EmptyState emoji="🍃" title="Nothing free yet today" />}
          <div className="space-y-3">
            {freeEvents.map((i) => i.kind === "event" && <EventCard key={i.event.id} event={i.event} />)}
          </div>
          {freeDeals.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">{freeDeals.map((i) => i.kind === "deal" && <DealCard key={i.deal.id} deal={i.deal} />)}</div>
          )}
        </section>

        <aside className="space-y-8">
          <section className="space-y-3" aria-labelledby="next-up">
            <SectionTitle>
              <span id="next-up">📅 Your next events</span>
            </SectionTitle>
            {mine.data && next.length === 0 && <p className="text-sm text-muted">Save an event and it shows up here, with a reminder 30 minutes before.</p>}
            <ul className="space-y-2">
              {next.map(({ event, registered }) => (
                <li key={event.id}>
                  <Link href={`/events/${event.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3 hover:border-ink">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{event.title}</span>
                      <span className="text-xs text-muted">
                        {untilLabel(event.starts_at, event.ends_at)} · {fmtTime(event.starts_at)}
                      </span>
                    </span>
                    {registered && <span className="shrink-0 text-xs font-semibold text-success">Registered</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {closest && (
            <Link href="/rewards" className="block space-y-2 rounded-2xl border border-line bg-surface p-4 hover:border-ink">
              <p className="text-xs font-semibold uppercase tracking-wide text-cardinal">Rewards</p>
              <p className="font-bold">{closest.program.name}</p>
              <div className="h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={closest.attended} aria-valuemax={closest.required} aria-label={`${closest.attended} of ${closest.required} events`}>
                <div className="h-full rounded-full bg-cardinal" style={{ width: `${(closest.attended / closest.required) * 100}%` }} />
              </div>
              <p className="text-sm text-muted">
                {closest.attended} of {closest.required} · {closest.required - closest.attended} more to go
              </p>
            </Link>
          )}

          <DigestCard />
          <AlertSettings />
        </aside>
      </div>
    </div>
  );
}

const ALERT_CATEGORIES: { value: NotifyCategory; label: string }[] = [
  ...CATEGORIES.filter((c) => c.value !== "other").map((c) => ({ value: c.value as NotifyCategory, label: `${c.emoji} ${c.label}` })),
  { value: "deals", label: "🎁 Deals" },
];

/** Alert settings: email / push on or off, and which categories. Saves on every change. */
function AlertSettings() {
  const prefs = useApi(() => api.notify.prefs());
  const [saved, setSaved] = useState<string | null>(null);

  async function update(patch: Partial<NotifyPrefs>) {
    if (!prefs.data) return;
    const optimistic = { ...prefs.data, ...patch };
    prefs.setData(optimistic);
    try {
      prefs.setData(await api.notify.updatePrefs(patch));
      setSaved("Saved");
    } catch (e) {
      setSaved(errorMessage(e));
    }
  }

  const p = prefs.data;
  const cats = new Set(p?.notify_categories ?? []);
  const toggleCat = (c: NotifyCategory) => {
    const next = new Set(cats);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    return update({ notify_categories: [...next] });
  };

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-surface p-4" aria-labelledby="alert-settings">
      <p id="alert-settings" className="font-bold">
        ⚙️ Alert settings
      </p>
      {!p && !prefs.error && <p className="text-sm text-muted">Loading…</p>}
      {prefs.error && <p className="text-sm text-danger">{prefs.error}</p>}
      {p && (
        <>
          <Switch label="Morning email digest" checked={p.notify_email} onChange={(v) => update({ notify_email: v })} />
          <Switch label="Phone notifications" checked={p.notify_push} onChange={(v) => update({ notify_push: v })} />
          <div className="space-y-1.5 border-t border-line pt-3">
            <p className="text-xs font-semibold text-muted">Only tell me about {cats.size === 0 && <span className="font-normal">(everything, pick to narrow)</span>}</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Alert categories">
              {ALERT_CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  onClick={() => toggleCat(c.value)}
                  aria-pressed={cats.has(c.value)}
                  className={`min-h-9 rounded-full border px-3 text-xs font-semibold transition ${cats.has(c.value) ? "border-cardinal bg-cardinal text-white" : "border-line bg-surface text-ink hover:border-ink"}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          {saved && (
            <p role="status" className={`text-xs ${saved === "Saved" ? "text-success" : "text-danger"}`}>
              {saved}
            </p>
          )}
        </>
      )}
    </section>
  );
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? "bg-cardinal" : "bg-line"}`}
      >
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${checked ? "left-6" : "left-1"}`} />
      </button>
    </label>
  );
}

/** Freebie alerts: preview today's digest, and the on-stage "Send digest now" (admins). */
function DigestCard() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.notify.digestNow(email.trim() ? { email: email.trim() } : {});
      setMsg(res.sent ? { ok: true, text: `Sent ${res.items} freebies to ${res.to}. Check your inbox!` } : { ok: false, text: res.skipped_reason ?? "Nothing sent" });
    } catch (err) {
      setMsg({ ok: false, text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-surface p-4" aria-labelledby="alerts">
      <p id="alerts" className="font-bold">
        🔔 Morning freebie digest
      </p>
      <p className="text-sm text-muted">Every morning at 8, one email with everything free on campus that day. Nothing on days with no freebies.</p>
      <a href={api.notify.digestPreviewUrl()} target="_blank" rel="noreferrer" className="text-sm font-semibold text-cardinal hover:underline">
        Preview today&apos;s email →
      </a>
      <form onSubmit={send} className="flex flex-col gap-2 border-t border-line pt-3">
        <label htmlFor="digest-email" className="text-xs font-semibold text-muted">
          Send it now (organizers &amp; admins)
        </label>
        <div className="flex gap-2">
          <input
            id="digest-email"
            type="email"
            placeholder="you@usc.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-11 min-w-0 flex-1 rounded-full border border-line px-4 text-sm"
          />
          <button disabled={busy} className={btn.primary}>
            {busy ? "Sending…" : "Send"}
          </button>
        </div>
        {msg && (
          <p role="status" className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>
            {msg.text}
          </p>
        )}
      </form>
    </section>
  );
}
