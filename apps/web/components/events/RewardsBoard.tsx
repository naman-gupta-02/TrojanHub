"use client";
// P3 Parnavi: Rewards. My rewards (progress, what counted, what I earned, my check-ins) and
// ways to earn around USC (perks for showing up, small tasks, applications, competitions).
import type { Perk, PerkWay, RewardProgress } from "@trojanhub/shared/types";
import Link from "next/link";
import { useState } from "react";

import { api } from "@/lib/api";
import { getAccessToken, supabase } from "@/lib/supabase";

import { CardSkeleton, Chip, EmptyState, ErrorState, EventCard, SectionTitle, fmtTime, relativeDay, useApi } from "./kit";

const dateFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", year: "numeric" });
const shortDate = (iso: string) => dateFmt.format(new Date(iso));

export function RewardsBoard() {
  const signedIn = useApi(() => getAccessToken().then(Boolean));
  const rewards = useApi(() => api.rewards.progress());
  const checkins = useApi(() => api.rewards.checkins());

  const programs = rewards.data ?? [];
  const earned = programs.filter((p) => (p.style ?? "goal") === "goal" && p.attended >= p.required).length;
  const entries = programs.filter((p) => p.style === "entries").reduce((n, p) => n + p.attended, 0);

  return (
    <div className="space-y-10">
      <header className="space-y-1">
        <h1 className="text-3xl font-extrabold">Rewards</h1>
        <p className="text-muted">Your progress from checking in at events, and everything else you can earn around USC.</p>
      </header>

      {signedIn.data === false && (
        <div role="note" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold bg-gold/15 p-4 text-sm">
          <p>
            <strong>You&apos;re seeing a demo student&apos;s rewards.</strong>{" "}
            {supabase ? "Sign in with your @usc.edu email to track your own check-ins." : "Sign-in is off on this copy of TrojanHub."}
          </p>
          {supabase && (
            <Link href="/login" className="inline-flex min-h-11 items-center rounded-full bg-cardinal px-5 font-semibold text-white">
              Sign in
            </Link>
          )}
        </div>
      )}

      <section className="space-y-4" aria-labelledby="mine">
        <SectionTitle>
          <span id="mine">🏆 My rewards</span>
        </SectionTitle>

        <div className="grid grid-cols-3 gap-3">
          <Stat label="Events checked in" value={checkins.data ? checkins.data.checkins.length : "–"} />
          <Stat label="Rewards earned" value={rewards.data ? earned : "–"} />
          <Stat label="Drawing entries" value={rewards.data ? entries : "–"} />
        </div>

        {rewards.loading && !rewards.data && <CardSkeleton count={2} />}
        {rewards.error && <ErrorState message={rewards.error} onRetry={rewards.reload} />}
        {rewards.data && programs.length === 0 && <EmptyState emoji="🏆" title="No reward programs yet" />}
        <div className="space-y-6">
          {programs.map((p) => (
            <ProgramCard key={p.program.id} p={p} />
          ))}
        </div>

        <RecentCheckins data={checkins.data?.checkins} error={checkins.error} />
        <p className="text-xs text-muted">
          TrojanHub keeps your own count from event check-ins. Each office&apos;s official check-in or form is what earns the
          reward, so follow its rules too.
        </p>
      </section>

      <PerksDirectory />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 text-center">
      <p className="text-3xl font-extrabold text-cardinal tabular-nums">{value}</p>
      <p className="text-xs font-semibold text-muted">{label}</p>
    </div>
  );
}

function ProgramCard({ p }: { p: RewardProgress }) {
  const entries = p.style === "entries";
  const done = !entries && p.attended >= p.required;
  const left = Math.max(p.required - p.attended, 0);
  const counted = p.attended_events ?? [];

  return (
    <section className="overflow-hidden rounded-3xl border border-line bg-surface" aria-labelledby={`prog-${p.program.id}`}>
      <div className={`p-6 ${done ? "bg-gold" : "bg-cardinal text-white"}`}>
        <div className="flex flex-wrap items-center gap-2">
          <p className={`text-xs font-semibold uppercase tracking-wide ${done ? "text-ink/70" : "text-gold"}`}>{p.program.office}</p>
          {entries && <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold">Prize drawing</span>}
        </div>
        <h2 id={`prog-${p.program.id}`} className="mt-1 text-2xl font-extrabold">
          {p.program.name}
        </h2>
        {p.program.reward_desc && <p className={`mt-1 text-sm ${done ? "text-ink/80" : "text-white/80"}`}>{p.program.reward_desc}</p>}

        <div className="mt-5 flex flex-wrap items-center gap-4">
          {entries ? (
            <p className="text-lg font-bold">
              🎟️ {p.attended} entr{p.attended === 1 ? "y" : "ies"}{" "}
              <span className="text-sm font-normal text-white/80">· each check-in adds one</span>
            </p>
          ) : (
            <>
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
                {done ? (
                  <>🎉 Earned{p.completed_at ? ` on ${shortDate(p.completed_at)}` : ""}</>
                ) : (
                  <>
                    {p.attended} of {p.required} <span className="text-sm font-normal text-white/80">· {left} to go</span>
                  </>
                )}
              </p>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6 p-6 md:grid-cols-2">
        <div className="space-y-2">
          <h3 className="font-bold">What counted</h3>
          {counted.length === 0 ? (
            <p className="text-sm text-muted">Nothing yet. Check in at one of the events on the right.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {counted.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl bg-background px-3 py-2">
                  <Link href={`/events/${c.id}`} className="truncate font-semibold hover:text-cardinal">
                    ✓ {c.title}
                  </Link>
                  <span className="shrink-0 text-xs text-muted">{shortDate(c.checked_in_at ?? c.starts_at)}</span>
                </li>
              ))}
            </ul>
          )}
          {done && (
            <p className="pt-2 text-sm">
              Claim it with {p.program.office}.{" "}
              {p.program.rules_url && (
                <a href={p.program.rules_url} target="_blank" rel="noreferrer" className="font-semibold text-cardinal hover:underline">
                  How to claim ↗
                </a>
              )}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold">{entries ? "Next chances for an entry" : done ? "More events" : "Events that count"}</h3>
            {p.program.rules_url && (
              <a href={p.program.rules_url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-cardinal hover:underline">
                Official rules ↗
              </a>
            )}
          </div>
          {p.next_eligible_events.length === 0 ? (
            <p className="text-sm text-muted">Nothing scheduled yet. Check back soon.</p>
          ) : (
            <div className="space-y-3">
              {p.next_eligible_events.map((e, i) => (
                <EventCard key={e.id} event={e} reason={!entries && i === 0 && left === 1 ? "This one completes it!" : undefined} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function RecentCheckins({ data, error }: { data?: { event: { id: string; title: string; starts_at: string }; checked_in_at: string | null }[]; error?: string }) {
  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!data || data.length === 0) return null;
  return (
    <div className="space-y-2 rounded-2xl border border-line bg-surface p-5">
      <h3 className="font-bold">📍 My recent check-ins</h3>
      <ul className="divide-y divide-line text-sm">
        {data.slice(0, 6).map(({ event, checked_in_at }) => (
          <li key={event.id} className="flex items-center justify-between gap-3 py-2">
            <Link href={`/events/${event.id}`} className="truncate font-semibold hover:text-cardinal">
              {event.title}
            </Link>
            <span className="shrink-0 text-xs text-muted">
              {checked_in_at ? `${relativeDay(checked_in_at)} ${fmtTime(checked_in_at)}` : relativeDay(event.starts_at)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ways to earn around USC
// ---------------------------------------------------------------------------
const WAYS: { value: PerkWay; label: string; emoji: string }[] = [
  { value: "attend", label: "Show up", emoji: "📍" },
  { value: "task", label: "Small tasks", emoji: "✅" },
  { value: "apply", label: "Apply", emoji: "📝" },
  { value: "compete", label: "Compete", emoji: "🏅" },
];
type Kind = "all" | "redeemable" | "recognition";

function PerksDirectory() {
  const perks = useApi(() => api.rewards.perks());
  const [kind, setKind] = useState<Kind>("all");
  const [way, setWay] = useState<PerkWay | null>(null);

  const list = (perks.data?.perks ?? []).filter(
    (p) => (kind === "all" || (kind === "redeemable") === p.redeemable) && (!way || p.way === way),
  );

  return (
    <section className="space-y-4" aria-labelledby="ways">
      <SectionTitle>
        <span id="ways">🎁 Ways to earn around USC</span>
      </SectionTitle>
      <p className="text-sm text-muted">
        Perks for showing up, quick tasks, applications and competitions across campus. Redeemable means money, gift cards,
        prizes or food; recognition means things like honor cords, trophies and priority access.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-full border border-line bg-surface p-1" role="radiogroup" aria-label="Kind of reward">
          {(
            [
              ["all", "All"],
              ["redeemable", "💵 Redeemable"],
              ["recognition", "🎖️ Recognition"],
            ] as [Kind, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              role="radio"
              aria-checked={kind === value}
              onClick={() => setKind(value)}
              className={`min-h-10 rounded-full px-4 text-sm font-semibold ${kind === value ? "bg-cardinal text-white" : "text-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {WAYS.map((w) => (
          <button
            key={w.value}
            onClick={() => setWay(way === w.value ? null : w.value)}
            aria-pressed={way === w.value}
            className={`min-h-10 rounded-full border px-4 text-sm font-semibold ${way === w.value ? "border-cardinal bg-cardinal text-white" : "border-line bg-surface text-ink hover:border-ink"}`}
          >
            {w.emoji} {w.label}
          </button>
        ))}
      </div>

      {perks.loading && !perks.data && <CardSkeleton count={3} />}
      {perks.error && <ErrorState message={perks.error} onRetry={perks.reload} />}
      {perks.data && list.length === 0 && <EmptyState emoji="🔎" title="Nothing matches those filters" />}

      <div className="grid gap-3 md:grid-cols-2">
        {list.map((p) => (
          <PerkCard key={p.id} perk={p} />
        ))}
      </div>

      {perks.data && (
        <p className="text-xs text-muted">
          Checked against each office&apos;s official page on {shortDate(`${perks.data.checked_on}T20:00:00Z`)}. Rules and dates
          change, so confirm on the official page before you count on a perk.
        </p>
      )}
    </section>
  );
}

function PerkCard({ perk }: { perk: Perk }) {
  const way = WAYS.find((w) => w.value === perk.way);
  const internal = perk.url.startsWith("/");
  const deadlinePassed = perk.deadline ? new Date(perk.deadline) < new Date() : false;
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip>
          {way?.emoji} {way?.label}
        </Chip>
        <Chip tone={perk.redeemable ? "gold" : "plain"}>{perk.redeemable ? "💵 Redeemable" : "🎖️ Recognition"}</Chip>
        {perk.tracked_program_id && (
          <Chip tone="cardinal" title="Your TrojanHub check-ins count toward this one (see My rewards)">
            Tracked in TrojanHub
          </Chip>
        )}
        {perk.deadline && !deadlinePassed && <Chip tone="green">Apply by {shortDate(perk.deadline)}</Chip>}
      </div>
      <div>
        <h3 className="text-lg font-bold">{perk.name}</h3>
        <p className="text-xs font-semibold text-muted">{perk.office}</p>
      </div>
      <dl className="space-y-1.5 text-sm">
        <Row label="You get">{perk.reward}</Row>
        <Row label="How">{perk.how_to_earn}</Row>
        <Row label="Who">{perk.who}</Row>
        <Row label="When">{perk.when}</Row>
      </dl>
      {internal ? (
        <Link href={perk.url} className="mt-auto text-sm font-semibold text-cardinal hover:underline">
          Open in TrojanHub →
        </Link>
      ) : (
        <a href={perk.url} target="_blank" rel="noreferrer" className="mt-auto text-sm font-semibold text-cardinal hover:underline">
          Official page ↗
        </a>
      )}
    </article>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[64px_1fr] gap-2">
      <dt className="font-semibold text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
