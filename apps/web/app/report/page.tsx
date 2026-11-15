"use client";
// P4 Jaymin: report a problem. The student describes it -> the AI drafts which office handles it
// and how urgent it is -> the student checks the draft and sends it. Same report as Tommy's
// file_complaint, from a form (source "form"). Below: the student's own reports and their status.
import type {
  ComplaintConfirmResponse,
  ComplaintDraftResponse,
  ComplaintRequest,
  Department,
  MyComplaintsResponse,
  TicketStatus,
  Urgency,
} from "@trojanhub/shared/types";
import { ApiRequestError } from "@trojanhub/shared/api";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";

const DEPARTMENT_LABEL: Record<Department, string> = {
  Facilities: "Facilities (FPM)",
  Housing: "Housing",
  ITS: "IT Services (ITS)",
  Transportation: "Transportation",
  DPS: "Public Safety (DPS)",
};
const URGENCY_STYLE: Record<Urgency, string> = {
  safety: "bg-danger text-white",
  high: "bg-cardinal/15 text-cardinal",
  medium: "bg-gold/40 text-ink",
  low: "bg-line text-ink",
};
const STATUS_LABEL: Record<TicketStatus, string> = { reported: "Reported", sent: "Sent to the office", resolved: "Resolved" };
const MAX_CHARS = 2000; // services/ai/app/complaints/routes.py MAX_TEXT_CHARS

const dateFormat = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

type Mine = MyComplaintsResponse["complaints"];

const officeOf = (d: Department | null | undefined) => (d ? ` · ${DEPARTMENT_LABEL[d]}` : "");

function errorText(e: unknown, fallback: string) {
  if (e instanceof ApiRequestError && e.status === 401) return "Sign in with your @usc.edu email to report a problem.";
  return e instanceof ApiRequestError ? e.message : fallback;
}

/** Phone photos are large: shrink to 1280 px JPEG and send as a data: URL (the API stores it privately). */
async function photoDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("We couldn't read that photo. Try a JPG or PNG.");
  });
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

export default function ReportPage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(supabase ? null : true);
  const [text, setText] = useState("");
  const [building, setBuilding] = useState("");
  const [room, setRoom] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ComplaintDraftResponse | null>(null);
  const [sent, setSent] = useState<ComplaintConfirmResponse | null>(null);
  const [mine, setMine] = useState<Mine | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadMine = useCallback(() => {
    api.complaints
      .mine()
      .then((r) => setMine(r.complaints))
      .catch(() => setMine([]));
  }, []);

  useEffect(() => {
    if (!supabase) {
      loadMine(); // mock mode: no sign-in, the API serves demo data
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(!!data.session);
      if (data.session) loadMine();
    });
    const { data } = supabase.auth.onAuthStateChange((_e, session) => setSignedIn(!!session));
    return () => data.subscription.unsubscribe();
  }, [loadMine]);

  const request = (): ComplaintRequest => ({
    text: text.trim(),
    building: building.trim() || undefined,
    room: room.trim() || undefined,
    anonymous,
    source: "form",
    photo: photo ?? undefined,
  });

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      setPhoto(await photoDataUrl(file));
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function check(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return setError("Describe the problem in a sentence.");
    setBusy(true);
    setError(null);
    try {
      setDraft(await api.complaints.draft(request()));
    } catch (e) {
      setError(errorText(e, "Couldn't check your report right now. Try again in a moment."));
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    setBusy(true);
    setError(null);
    try {
      setSent(await api.complaints.confirm(request()));
      loadMine();
    } catch (e) {
      setError(errorText(e, "Couldn't send your report right now. Try again in a moment."));
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    setText("");
    setBuilding("");
    setRoom("");
    setAnonymous(false);
    setPhoto(null);
    setDraft(null);
    setSent(null);
    setError(null);
  }

  if (signedIn === null) return <p className="text-muted">Loading…</p>;

  if (signedIn === false) {
    return (
      <section className="max-w-2xl space-y-4">
        <h1 className="text-3xl font-bold">Report a problem</h1>
        <p className="rounded-lg border border-line bg-surface p-4">
          <Link href="/login" className="font-semibold text-cardinal underline">
            Sign in
          </Link>{" "}
          with your @usc.edu email to report a problem on campus. For an emergency, call DPS at{" "}
          <a href="tel:+12137404321" className="font-semibold underline">
            (213) 740-4321
          </a>
          .
        </p>
      </section>
    );
  }

  return (
    <section className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Report a problem</h1>
        <p className="text-muted">
          Broken AC, a leak, Wi-Fi down, a dark walkway… Say what&apos;s wrong and where. Our AI picks the right USC office and joins
          reports of the same problem together. You can also just tell{" "}
          <Link href="/chat" className="text-cardinal underline">
            Tommy
          </Link>
          .
        </p>
      </div>

      {sent ? (
        <Sent sent={sent} onAgain={startOver} />
      ) : (
        <form onSubmit={check} className="space-y-4">
          <label className="block space-y-1">
            <span className="font-semibold">What&apos;s wrong?</span>
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setDraft(null);
              }}
              maxLength={MAX_CHARS}
              rows={4}
              required
              placeholder="e.g. It's really hot in GFS 213, the AC isn't working"
              className="w-full rounded-md border border-line bg-surface px-3 py-2"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="font-semibold">Building</span> <span className="text-sm text-muted">(optional)</span>
              <input
                value={building}
                onChange={(e) => {
                  setBuilding(e.target.value);
                  setDraft(null);
                }}
                placeholder="e.g. GFS or Leavey Library"
                className="min-h-11 w-full rounded-md border border-line bg-surface px-3"
              />
            </label>
            <label className="block space-y-1">
              <span className="font-semibold">Room</span> <span className="text-sm text-muted">(optional)</span>
              <input
                value={room}
                onChange={(e) => {
                  setRoom(e.target.value);
                  setDraft(null);
                }}
                placeholder="e.g. 213"
                className="min-h-11 w-full rounded-md border border-line bg-surface px-3"
              />
            </label>
          </div>

          <div className="space-y-2">
            <span className="block font-semibold">
              Photo <span className="text-sm font-normal text-muted">(optional; only the office and admins see it)</span>
            </span>
            <div className="flex flex-wrap items-end gap-3">
              {photo && (
                // eslint-disable-next-line @next/next/no-img-element -- local preview
                <img src={photo} alt="Your photo of the problem" className="h-28 w-28 rounded-lg border border-line object-cover" />
              )}
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="min-h-11 rounded-md border border-line bg-surface px-4 font-semibold hover:bg-background"
              >
                {photo ? "Change photo" : "Add a photo"}
              </button>
              {photo && (
                <button type="button" onClick={() => setPhoto(null)} className="min-h-11 px-2 text-sm text-muted underline">
                  Remove photo
                </button>
              )}
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              aria-label="Photo of the problem"
              onChange={(e) => {
                void pickPhoto(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>

          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="h-5 w-5 accent-cardinal" />
            <span>
              Report anonymously <span className="text-sm text-muted">(your name isn&apos;t attached; it won&apos;t show in My reports)</span>
            </span>
          </label>

          {error && <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>}

          {draft ? (
            <DraftCard draft={draft} busy={busy} onSend={send} />
          ) : (
            <button disabled={busy} className="min-h-11 w-full rounded-md bg-cardinal font-semibold text-white hover:bg-cardinal-dark disabled:opacity-60">
              {busy ? "Reading your report…" : "Check my report"}
            </button>
          )}
        </form>
      )}

      <MyReports mine={mine} />
    </section>
  );
}

function DraftCard({ draft: res, busy, onSend }: { draft: ComplaintDraftResponse; busy: boolean; onSend: () => void }) {
  if (res.safety) {
    return (
      <div className="space-y-2 rounded-lg border-2 border-danger bg-danger/5 p-4" role="alert">
        <p className="text-lg font-bold text-danger">This sounds like a safety issue.</p>
        <p>{res.safety.message}</p>
        <a
          href={`tel:${res.safety.dps_phone.replace(/[^\d+]/g, "")}`}
          className="inline-flex min-h-11 items-center rounded-md bg-danger px-4 font-semibold text-white"
        >
          Call DPS {res.safety.dps_phone}
        </a>
        <p className="text-sm text-muted">We don&apos;t file safety issues as tickets: a ticket is too slow. In an emergency call 911.</p>
      </div>
    );
  }
  const d = res.draft;
  const where = [d.building, d.room].filter(Boolean).join(" ");
  return (
    <div className="space-y-3 rounded-lg border border-line bg-surface p-4">
      <p className="text-sm font-semibold uppercase tracking-wide text-muted">Check before sending</p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg font-semibold">{DEPARTMENT_LABEL[d.department]}</span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${URGENCY_STYLE[d.urgency]}`}>{d.urgency} urgency</span>
      </div>
      <p>{d.summary}</p>
      {where && <p className="text-sm text-muted">Where: {where}</p>}
      <p className="text-sm text-muted">Why this office: {d.reason}</p>
      {res.duplicate_ticket && (
        <p className="rounded-md bg-gold/25 p-3 text-sm">
          {res.duplicate_ticket.report_count === 1 ? "1 student has" : `${res.duplicate_ticket.report_count} students have`} already
          reported this. Sending adds your report to the same ticket, so it gets fixed sooner.
        </p>
      )}
      <button
        type="button"
        onClick={onSend}
        disabled={busy}
        className="min-h-11 w-full rounded-md bg-cardinal font-semibold text-white hover:bg-cardinal-dark disabled:opacity-60"
      >
        {busy ? "Sending…" : res.duplicate_ticket ? "Add my report" : `Send to ${DEPARTMENT_LABEL[d.department]}`}
      </button>
      <p className="text-xs text-muted">Not right? Change your description above and check again.</p>
    </div>
  );
}

function Sent({ sent, onAgain }: { sent: ComplaintConfirmResponse; onAgain: () => void }) {
  const t = sent.ticket;
  return (
    <div className="space-y-3 rounded-lg border border-success/40 bg-success/5 p-4" role="status">
      <p className="text-lg font-bold">Sent. Thank you!</p>
      <p>
        Your report is with <strong>{DEPARTMENT_LABEL[t.department]}</strong>: {t.summary}
      </p>
      <p className="text-sm text-muted">
        {t.report_count > 1 ? `${t.report_count} reports on this ticket. ` : ""}Status: {STATUS_LABEL[t.status]}.
        {sent.photo_saved ? " Your photo was attached." : ""}
      </p>
      {sent.route_url && (
        <p className="text-sm">
          The office&apos;s own request page, if you want to follow up:{" "}
          <a href={sent.route_url} target="_blank" rel="noreferrer" className="break-all text-cardinal underline">
            {sent.route_url}
          </a>
        </p>
      )}
      <button type="button" onClick={onAgain} className="min-h-11 rounded-md border border-line bg-surface px-4 font-semibold hover:bg-background">
        Report something else
      </button>
    </div>
  );
}

function MyReports({ mine }: { mine: Mine | null }) {
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-bold">My reports</h2>
      {mine === null ? (
        <p className="text-muted">Loading…</p>
      ) : mine.length === 0 ? (
        <p className="text-muted">Nothing yet. Reports you send (here or through Tommy) show up here with their status.</p>
      ) : (
        <ul className="space-y-2">
          {mine.map(({ complaint: c, ticket: t }) => (
            <li key={c.id} className="space-y-1 rounded-lg border border-line bg-surface p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{t?.summary ?? c.raw_text}</span>
                {t && <StatusBadge status={t.status} />}
              </div>
              <p className="text-sm text-muted">
                {dateFormat.format(new Date(c.created_at))}
                {officeOf(c.corrected_department ?? c.ai_department ?? t?.department)}
                {t && t.report_count > 1 ? ` · ${t.report_count} reports` : ""}
                {c.source === "chat" ? " · via Tommy" : ""}
                {c.has_photo ? " · photo" : ""}
              </p>
              {t?.summary && t.summary !== c.raw_text && <p className="text-sm">“{c.raw_text}”</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: TicketStatus }) {
  const style = status === "resolved" ? "bg-success/15 text-success" : status === "sent" ? "bg-gold/40 text-ink" : "bg-line text-ink";
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${style}`}>{STATUS_LABEL[status]}</span>;
}
