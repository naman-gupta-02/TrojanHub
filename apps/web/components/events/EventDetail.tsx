"use client";
// P3 Parnavi: event detail (Add to calendar, Register, Save, tickets, check-in, rewards it counts toward).
import type { CheckinResponse, EventDetailResponse } from "@trojanhub/shared/types";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";

import { Chip, ErrorState, Verified, btn, canCheckIn, categoryInfo, errorMessage, fmtTime, relativeDay, timeRange, untilLabel, useApi, useNow } from "./kit";

export function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const detail = useApi(() => api.events.get(id), id);

  if (detail.error) return <ErrorState message={detail.error} onRetry={detail.reload} />;
  if (!detail.data) return <DetailSkeleton />;
  return <Detail d={detail.data} onChange={detail.setData} />;
}

function Detail({ d, onChange }: { d: EventDetailResponse; onChange: (d: EventDetailResponse) => void }) {
  const e = d.event;
  const cat = categoryInfo(e.category);
  const status = untilLabel(e.starts_at, e.ends_at);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  async function act(name: string, fn: () => Promise<void>) {
    setBusy(name);
    setToast(null);
    try {
      await fn();
    } catch (err) {
      setToast({ ok: false, text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  const toggleSave = () =>
    act("save", async () => {
      if (d.saved) {
        await api.events.unsave(e.id);
        onChange({ ...d, saved: false, registered: false });
      } else {
        await api.events.save(e.id);
        onChange({ ...d, saved: true });
        setToast({ ok: true, text: "Saved. We'll remind you 30 minutes before." });
      }
    });

  const register = () => {
    // open the form right on the click; after an await, browsers treat it as a popup and block it
    if (e.register_url) window.open(e.register_url, "_blank", "noopener");
    return act("register", async () => {
      try {
        await api.events.save(e.id, { register: true });
      } catch (err) {
        // the organizer's form is open either way; only our calendar copy failed
        if (e.register_url) throw new Error(`The form is open in a new tab, but we couldn't add it to your TrojanHub calendar: ${errorMessage(err)}`);
        throw err;
      }
      onChange({ ...d, saved: true, registered: true });
      if (!e.register_url) setToast({ ok: true, text: "You're registered! It's on your TrojanHub calendar." });
    });
  };

  return (
    <article className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <Link href="/events" className="text-sm font-semibold text-cardinal hover:underline">
          ← All events
        </Link>

        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Chip>
              {cat.emoji} {cat.label}
            </Chip>
            {status === "Happening now" && <Chip tone="green">● Happening now</Chip>}
            {e.source === "community" && <Chip title="Posted by a student, not a verified org">Community posted</Chip>}
            {e.source === "flyer" && <Chip title="Added from a scanned flyer">From a flyer</Chip>}
          </div>
          <h1 className="text-3xl font-extrabold sm:text-4xl">{e.title}</h1>
          {e.org_name && (e.org_verified ? <Verified name={e.org_name} /> : <p className="text-sm text-muted">Hosted by {e.org_name}</p>)}
        </header>

        <dl className="grid gap-4 rounded-2xl border border-line bg-surface p-5 sm:grid-cols-2">
          <Fact icon="🗓️" label="When">
            {relativeDay(e.starts_at)}, {timeRange(e.starts_at, e.ends_at)}
            <span className="block text-xs text-muted">{status}</span>
          </Fact>
          <Fact icon="📍" label="Where">
            {e.location_text ?? "TBA"}
            {e.location_text && (
              <a
                className="block text-xs font-semibold text-cardinal hover:underline"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${e.location_text}, University of Southern California`)}`}
                target="_blank"
                rel="noreferrer"
              >
                Open in Maps
              </a>
            )}
          </Fact>
          <Fact icon="🎟️" label="Cost">
            {e.is_free ? "Free to attend" : "Ticketed"}
          </Fact>
          {e.has_freebie && (
            <Fact icon="🎁" label="Freebie">
              <span className="font-semibold">{e.freebie_desc ?? "Yes!"}</span>
            </Fact>
          )}
        </dl>

        {e.description && <p className="whitespace-pre-line text-lg leading-relaxed">{e.description}</p>}

        {e.tickets_open_at && <TicketCountdown opensAt={e.tickets_open_at} url={e.ticket_url} saved={d.saved} onSave={toggleSave} />}

        {d.counts_toward.length > 0 && (
          <section className="space-y-2 rounded-2xl border border-gold bg-gold/10 p-5">
            <p className="font-bold">🏆 Counts toward rewards</p>
            {d.counts_toward.map((p) => (
              <Link key={p.program_id} href="/rewards" className="block text-sm hover:underline">
                {p.style === "entries" ? (
                  <>
                    {p.name}: {p.attended} entr{p.attended === 1 ? "y" : "ies"} so far
                    {!d.attended && <strong className="text-cardinal"> · checking in here adds one</strong>}
                  </>
                ) : (
                  <>
                    {p.name}: {p.attended} of {p.required} attended
                    {p.attended + 1 === p.required && !d.attended && <strong className="text-cardinal"> · this one completes it!</strong>}
                  </>
                )}
              </Link>
            ))}
          </section>
        )}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <div className="space-y-3 rounded-2xl border border-line bg-surface p-5">
          {e.register_url || !e.ticket_url ? (
            <button onClick={register} disabled={busy !== null} className={`${btn.primary} w-full`}>
              {d.registered ? "✓ Registered" : e.register_url ? "Register ↗" : "Register / RSVP"}
            </button>
          ) : (
            <a href={e.ticket_url} target="_blank" rel="noreferrer" className={`${btn.primary} w-full`}>
              Get tickets ↗
            </a>
          )}
          <button onClick={toggleSave} disabled={busy !== null} aria-pressed={d.saved} className={`${btn.secondary} w-full`}>
            {d.saved ? "★ Saved to my calendar" : "☆ Save"}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <a href={d.google_calendar_url} target="_blank" rel="noreferrer" className={`${btn.secondary} px-3 text-sm`}>
              Google Cal
            </a>
            <a href={api.events.icsUrl(e.id)} className={`${btn.secondary} px-3 text-sm`}>
              Apple / .ics
            </a>
          </div>
          {toast && (
            <p role="status" className={`text-sm ${toast.ok ? "text-success" : "text-danger"}`}>
              {toast.text}
            </p>
          )}
        </div>

        {d.can_edit && <YourEvent eventId={e.id} title={e.title} />}
        <CheckIn detail={d} onChange={onChange} />
        <OrganizerCode eventId={e.id} />
      </aside>
    </article>
  );
}

function Fact({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="text-xl" aria-hidden>
        {icon}
      </span>
      <div>
        <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
        <dd className="text-ink">{children}</dd>
      </div>
    </div>
  );
}

function TicketCountdown({ opensAt, url, saved, onSave }: { opensAt: string; url: string | null; saved: boolean; onSave: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = new Date(opensAt).getTime() - now;
  const open = ms <= 0;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return (
    <section className={`flex flex-wrap items-center gap-4 rounded-2xl p-5 ${open ? "bg-success/10" : "bg-cardinal text-white"}`}>
      <div className="flex-1">
        <p className={`text-sm font-semibold ${open ? "text-success" : "text-gold"}`}>{open ? "Tickets are on sale" : "Tickets open soon"}</p>
        <p className="text-2xl font-extrabold tabular-nums">
          {open ? "Go go go!" : h >= 24 ? `${relativeDay(opensAt)} at ${fmtTime(opensAt)}` : `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`}
        </p>
        {!open && <p className="text-sm text-white/80">Save this event and we&apos;ll alert you 30 minutes before tickets drop.</p>}
      </div>
      {open && url ? (
        <a href={url} target="_blank" rel="noreferrer" className={btn.primary}>
          Buy tickets ↗
        </a>
      ) : (
        !saved && (
          <button onClick={onSave} className="min-h-11 rounded-full bg-gold px-5 font-semibold text-ink">
            🔔 Alert me
          </button>
        )
      )}
    </section>
  );
}

function CheckIn({ detail, onChange }: { detail: EventDetailResponse; onChange: (d: EventDetailResponse) => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckinResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  useNow(); // re-check every 30 s, so "I'm here!" appears without a refresh
  const live = canCheckIn(detail.event.starts_at, detail.event.ends_at);

  async function checkIn(withCode?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await api.events.checkin(detail.event.id, withCode ? { code: withCode } : {});
      setResult(res);
      onChange({
        ...detail,
        attended: true,
        counts_toward: detail.counts_toward.map((p) => {
          const r = res.rewards.find((x) => x.program.id === p.program_id);
          return r ? { ...p, attended: r.attended } : p;
        }),
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (detail.attended) {
    return (
      <div className="space-y-2 rounded-2xl border border-success/30 bg-success/10 p-5">
        <p className="font-bold text-success">✓ You checked in</p>
        {result?.rewards.map((r) => (
          <p key={r.program.id} className="text-sm">
            {r.style === "entries" ? (
              <>
                🎟️ {r.program.name}: <strong>{r.attended} entr{r.attended === 1 ? "y" : "ies"}</strong>
              </>
            ) : r.attended >= r.required ? (
              <strong>🎉 {r.program.name} complete! Claim your reward from {r.program.office}.</strong>
            ) : (
              <>
                {r.program.name}: <strong>{r.attended} of {r.required}</strong>, {r.required - r.attended} to go
              </>
            )}
          </p>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface p-5">
      <p className="font-bold">📍 Check in</p>
      {live ? (
        <button onClick={() => checkIn()} disabled={busy} className={`${btn.primary} w-full`}>
          {busy ? "Checking in…" : "I'm here!"}
        </button>
      ) : (
        <p className="text-sm text-muted">Check-in opens 30 minutes before it starts, or enter the organizer&apos;s code.</p>
      )}
      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          if (code.trim()) checkIn(code.trim());
        }}
        className="flex gap-2"
      >
        <input
          value={code}
          onChange={(ev) => setCode(ev.target.value.toUpperCase())}
          maxLength={8}
          placeholder="Event code"
          aria-label="Organizer's check-in code"
          className="min-h-11 min-w-0 flex-1 rounded-full border border-line px-4 font-mono tracking-widest"
        />
        <button disabled={busy || !code.trim()} className={btn.secondary}>
          Go
        </button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Only for the person who posted it: fix a mistake, or take it down. */
function YourEvent({ eventId, title }: { eventId: string; title: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm(`Delete "${title}"? It will be removed from TrojanHub for everyone.`)) return;
    setDeleting(true);
    setError(null);
    try {
      await api.events.remove(eventId);
      router.push("/events");
    } catch (err) {
      setError(errorMessage(err));
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface p-5 text-sm">
      <p className="font-bold">✏️ You posted this</p>
      <p className="text-muted">Spotted a mistake? Fix it here.</p>
      <div className="grid grid-cols-2 gap-2">
        <Link href={`/events/${eventId}/edit`} className={btn.primary}>
          Edit event
        </Link>
        <button onClick={remove} disabled={deleting} className={`${btn.secondary} text-danger`}>
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function OrganizerCode({ eventId }: { eventId: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <details className="rounded-2xl border border-line bg-surface p-5 text-sm">
      <summary className="cursor-pointer font-semibold">For organizers: show check-in code</summary>
      <div className="mt-3 space-y-2">
        {code ? (
          <p className="rounded-xl bg-ink py-4 text-center font-mono text-3xl font-bold tracking-[0.3em] text-gold">{code}</p>
        ) : (
          <button
            onClick={() =>
              api.events
                .checkinCode(eventId)
                .then((r) => setCode(r.code))
                .catch((e) => setError(errorMessage(e)))
            }
            className={btn.secondary}
          >
            Show code
          </button>
        )}
        <p className="text-muted">Put it on a slide at the door. Attendees enter it to check in and earn reward credit.</p>
        {error && <p className="text-danger">{error}</p>}
      </div>
    </details>
  );
}

function DetailSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-busy aria-label="Loading event">
      <div className="h-4 w-24 rounded bg-line" />
      <div className="h-10 w-2/3 rounded bg-line" />
      <div className="h-32 rounded-2xl bg-line" />
      <div className="h-20 rounded-2xl bg-line" />
    </div>
  );
}

export { DetailSkeleton };
