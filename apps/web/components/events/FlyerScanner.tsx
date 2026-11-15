"use client";
// P3 Parnavi: flyer scanner. Photo -> upload -> AI reads it -> editable form (confidence + missing) -> event or deal.
import { ApiRequestError } from "@trojanhub/shared/api";
import type { EventCategory, FlyerFields, FlyerScanResponse } from "@trojanhub/shared/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { api } from "@/lib/api";

import { CATEGORIES, btn, errorMessage, fmtTime, fromLocalInput, relativeDay, toLocalInput } from "./kit";

type Stage = "pick" | "reading" | "form";
type Kind = "event" | "deal";

interface Form {
  title: string;
  description: string;
  starts_at: string; // datetime-local, LA time
  ends_at: string;
  location_text: string;
  category: EventCategory;
  is_free: boolean;
  has_freebie: boolean;
  freebie_desc: string;
  register_url: string;
  ticket_url: string;
  tickets_open_at: string;
  org_name: string;
  how_to_claim: string;
}

const EMPTY: Form = {
  title: "", description: "", starts_at: "", ends_at: "", location_text: "", category: "other", is_free: true,
  has_freebie: false, freebie_desc: "", register_url: "", ticket_url: "", tickets_open_at: "", org_name: "", how_to_claim: "",
};

const STEPS = ["Uploading photo", "Reading the flyer", "Checking for duplicates"];
const LOW = 0.7;

export function FlyerScanner() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("pick");
  const [step, setStep] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [flyerUrl, setFlyerUrl] = useState<string | null>(null);
  const [scan, setScan] = useState<FlyerScanResponse | null>(null);
  const [kind, setKind] = useState<Kind>("event");
  const [form, setForm] = useState<Form>(EMPTY);
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ id: string; title: string; starts_at?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("That's not an image. Snap or upload a photo of the flyer.");
    setError(null);
    setPreview(URL.createObjectURL(file));
    setStage("reading");
    setStep(0);
    try {
      const { image_url } = await api.flyers.upload(file);
      setFlyerUrl(image_url.startsWith("data:") ? null : image_url);
      setStep(1);
      const res = await api.flyers.scan({ image_url });
      setStep(2);
      await new Promise((r) => setTimeout(r, 350)); // let the last step register visually
      applyScan(res);
    } catch (e) {
      setError(errorMessage(e));
      setStage("pick");
    }
  }

  function applyScan(res: FlyerScanResponse) {
    const f = res.fields;
    setScan(res);
    setKind(res.type);
    setBuildingId(f.building_id);
    setDuplicate(res.duplicate ?? (res.duplicate_of ? { id: res.duplicate_of, title: "an existing event" } : null));
    setForm({
      title: f.title ?? "",
      description: res.extra?.description ?? "",
      starts_at: toLocalInput(f.starts_at),
      ends_at: toLocalInput(f.ends_at),
      location_text: f.location_text ?? "",
      category: f.category ?? "other",
      is_free: f.is_free ?? true,
      has_freebie: f.has_freebie ?? false,
      freebie_desc: f.freebie_desc ?? "",
      register_url: f.register_url ?? "",
      ticket_url: res.extra?.ticket_url ?? "",
      tickets_open_at: toLocalInput(res.extra?.tickets_open_at),
      org_name: f.org_name ?? "",
      how_to_claim: res.extra?.how_to_claim ?? "",
    });
    setStage("form");
  }

  function startManual() {
    setScan(null);
    setPreview(null);
    setFlyerUrl(null);
    setDuplicate(null);
    setForm(EMPTY);
    setStage("form");
  }

  async function submit(force = false) {
    setError(null);
    if (form.title.trim().length < 3) return setError("Add a title (at least 3 characters).");
    if (kind === "event" && !form.starts_at) return setError("When does it start?");
    setSaving(true);
    try {
      if (kind === "event") {
        const { event } = await api.events.create({
          title: form.title.trim(),
          description: form.description || null,
          starts_at: fromLocalInput(form.starts_at)!,
          ends_at: fromLocalInput(form.ends_at),
          location_text: form.location_text || null,
          building_id: buildingId,
          category: form.category,
          is_free: form.is_free,
          has_freebie: form.has_freebie,
          freebie_desc: form.has_freebie ? form.freebie_desc || null : null,
          register_url: form.register_url || null,
          ticket_url: form.ticket_url || null,
          tickets_open_at: fromLocalInput(form.tickets_open_at),
          org_name: form.org_name || null,
          flyer_url: flyerUrl,
          force,
        });
        router.push(`/events/${event.id}`);
      } else {
        await api.deals.create({
          title: form.title.trim(),
          description: form.description || null,
          kind: form.ends_at ? "one_time" : "ongoing",
          how_to_claim: form.how_to_claim || null,
          link: form.register_url || null,
          starts_at: fromLocalInput(form.starts_at),
          expires_at: fromLocalInput(form.ends_at),
        });
        router.push("/deals");
      }
    } catch (e) {
      if (e instanceof ApiRequestError && e.code === "duplicate") {
        setDuplicate({ id: String(e.details.duplicate_of), title: e.message.replace(/^Looks like "|" is already posted$/g, "") });
      } else {
        setError(errorMessage(e));
      }
      setSaving(false);
    }
  }

  // ----- pick -----------------------------------------------------------------
  if (stage === "pick") {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Header />
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            onFile(e.dataTransfer.files[0]);
          }}
          className={`flex flex-col items-center gap-4 rounded-3xl border-2 border-dashed p-10 text-center transition ${dragging ? "border-cardinal bg-cardinal/5" : "border-line bg-surface"}`}
        >
          <span className="text-5xl" aria-hidden>
            📸
          </span>
          <div>
            <p className="text-lg font-bold">Snap or drop a flyer</p>
            <p className="text-sm text-muted">Posters, Instagram screenshots, table tents… AI fills in the details. You check them before anything is posted.</p>
          </div>
          <button onClick={() => fileInput.current?.click()} className={btn.primary}>
            Choose a photo
          </button>
          <input ref={fileInput} type="file" accept="image/*" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} aria-label="Flyer photo" />
        </div>
        {error && <p role="alert" className="rounded-xl bg-danger/5 p-3 text-sm text-danger">{error}</p>}
        <p className="text-center text-sm text-muted">
          No flyer?{" "}
          <button onClick={startManual} className="font-semibold text-cardinal hover:underline">
            Enter the details yourself
          </button>
        </p>
      </div>
    );
  }

  // ----- reading -------------------------------------------------------------
  if (stage === "reading") {
    return (
      <div className="mx-auto grid max-w-3xl items-center gap-8 md:grid-cols-2">
        {preview && (
          <div className="relative overflow-hidden rounded-3xl border border-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Your flyer" className="max-h-[480px] w-full object-contain" />
            <div className="absolute inset-x-0 top-0 h-1/3 animate-[scan_1.6s_ease-in-out_infinite] bg-gradient-to-b from-transparent via-gold/40 to-transparent" />
          </div>
        )}
        <div className="space-y-4">
          <h1 className="text-2xl font-extrabold">Reading your flyer…</h1>
          <ol className="space-y-3">
            {STEPS.map((s, i) => (
              <li key={s} className="flex items-center gap-3">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${i < step ? "bg-success text-white" : i === step ? "animate-pulse bg-gold text-ink" : "bg-line text-muted"}`}
                >
                  {i < step ? "✓" : i + 1}
                </span>
                <span className={i <= step ? "font-semibold" : "text-muted"}>{s}</span>
              </li>
            ))}
          </ol>
        </div>
        <style>{`@keyframes scan { 0% { transform: translateY(-100%) } 100% { transform: translateY(300%) } }`}</style>
      </div>
    );
  }

  // ----- form ------------------------------------------------------------------
  const conf = scan?.confidence ?? {};
  const missing = new Set(scan?.missing ?? []);
  const field = (key: keyof FlyerFields | "description" | "ticket_url" | "tickets_open_at" | "how_to_claim") => ({
    ai: !!scan && (key in conf || (key in (scan.extra ?? {}) && !!scan.extra?.[key as keyof NonNullable<FlyerScanResponse["extra"]>])),
    low: !!scan && key in conf && (conf[key as keyof FlyerFields] ?? 1) < LOW,
    missing: !!scan && missing.has(key as keyof FlyerFields),
  });
  const filled = scan ? Object.keys(conf).length : 0;
  const toCheck = scan ? Object.values(conf).filter((v) => (v ?? 1) < LOW).length : 0;

  return (
    <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <button onClick={() => setStage("pick")} className="text-sm font-semibold text-cardinal hover:underline">
          ← Scan a different flyer
        </button>
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Your flyer" className="w-full rounded-2xl border border-line object-contain" />
        )}
        {scan && (
          <div className="space-y-1 rounded-2xl border border-line bg-surface p-4 text-sm">
            <p className="font-bold">✨ AI filled {filled} fields</p>
            {toCheck > 0 ? (
              <p className="text-amber-800">{toCheck} look uncertain. They&apos;re highlighted, so give them a quick check.</p>
            ) : (
              <p className="text-muted">Everything read clearly. Still, take a look before posting.</p>
            )}
            {missing.size > 0 && <p className="text-muted">Not on the flyer: {[...missing].map(labelFor).join(", ")}.</p>}
          </div>
        )}
      </aside>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-extrabold">{scan ? "Check the details" : "Add an event or deal"}</h1>
          <div className="flex rounded-full border border-line bg-surface p-1" role="radiogroup" aria-label="Post type">
            {(["event", "deal"] as Kind[]).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
                className={`min-h-9 rounded-full px-4 text-sm font-semibold ${kind === k ? "bg-cardinal text-white" : "text-muted"}`}
              >
                {k === "event" ? "📅 Event" : "🎁 Deal"}
              </button>
            ))}
          </div>
        </div>

        {duplicate && (
          <div role="alert" className="space-y-2 rounded-2xl border border-gold bg-gold/15 p-4">
            <p className="font-bold">👀 This might already be posted</p>
            <p className="text-sm">
              We found <strong>{duplicate.title}</strong>
              {duplicate.starts_at && <> on {relativeDay(duplicate.starts_at)} at {fmtTime(duplicate.starts_at)}</>}. Posting it twice splits the RSVPs.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href={`/events/${duplicate.id}`} className={btn.primary}>
                View existing event
              </Link>
              <button type="button" onClick={() => submit(true)} disabled={saving} className={btn.secondary}>
                It&apos;s different, post anyway
              </button>
            </div>
          </div>
        )}

        <Field label="Title" {...field("title")}>
          <input value={form.title} onChange={(e) => set("title", e.target.value)} required className={input} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={kind === "event" ? "Starts" : "Starts (optional)"} {...field("starts_at")}>
            <input type="datetime-local" value={form.starts_at} onChange={(e) => set("starts_at", e.target.value)} className={input} />
          </Field>
          <Field label={kind === "event" ? "Ends" : "Expires"} {...field("ends_at")}>
            <input type="datetime-local" value={form.ends_at} onChange={(e) => set("ends_at", e.target.value)} className={input} />
          </Field>
        </div>

        {kind === "event" ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Where" {...field("location_text")}>
                <input value={form.location_text} onChange={(e) => set("location_text", e.target.value)} placeholder="e.g. TCC 450" className={input} />
              </Field>
              <Field label="Hosted by" {...field("org_name")}>
                <input value={form.org_name} onChange={(e) => set("org_name", e.target.value)} placeholder="Org or office" className={input} />
              </Field>
            </div>

            <Field label="Category" {...field("category")}>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    aria-pressed={form.category === c.value}
                    onClick={() => set("category", c.value)}
                    className={`min-h-10 rounded-full border px-4 text-sm font-semibold ${form.category === c.value ? "border-cardinal bg-cardinal text-white" : "border-line bg-surface"}`}
                  >
                    {c.emoji} {c.label}
                  </button>
                ))}
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Cost" {...field("is_free")}>
                <label className="flex min-h-11 items-center gap-3 rounded-xl border border-line bg-surface px-4">
                  <input type="checkbox" checked={form.is_free} onChange={(e) => set("is_free", e.target.checked)} className="h-5 w-5 accent-cardinal" />
                  Free to attend
                </label>
              </Field>
              <Field label="Freebie" {...field("has_freebie")}>
                <label className="flex min-h-11 items-center gap-3 rounded-xl border border-line bg-surface px-4">
                  <input type="checkbox" checked={form.has_freebie} onChange={(e) => set("has_freebie", e.target.checked)} className="h-5 w-5 accent-cardinal" />
                  They give stuff away 🎁
                </label>
              </Field>
            </div>
            {form.has_freebie && (
              <Field label="What's free?" {...field("freebie_desc")}>
                <input value={form.freebie_desc} onChange={(e) => set("freebie_desc", e.target.value)} placeholder="Free pizza and boba" className={input} />
              </Field>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="RSVP / register link" {...field("register_url")}>
                <input value={form.register_url} onChange={(e) => set("register_url", e.target.value)} placeholder="https://…" className={input} />
              </Field>
              <Field label="Ticket link" {...field("ticket_url")}>
                <input value={form.ticket_url} onChange={(e) => set("ticket_url", e.target.value)} placeholder="https://…" className={input} />
              </Field>
            </div>
            {(form.ticket_url || form.tickets_open_at) && (
              <Field label="Tickets go on sale" hint="We'll alert everyone who saved it 30 minutes before" {...field("tickets_open_at")}>
                <input type="datetime-local" value={form.tickets_open_at} onChange={(e) => set("tickets_open_at", e.target.value)} className={input} />
              </Field>
            )}
          </>
        ) : (
          <>
            <Field label="How to claim" {...field("how_to_claim")}>
              <input value={form.how_to_claim} onChange={(e) => set("how_to_claim", e.target.value)} placeholder="Show your USCard" className={input} />
            </Field>
            <Field label="Link" {...field("register_url")}>
              <input value={form.register_url} onChange={(e) => set("register_url", e.target.value)} placeholder="https://…" className={input} />
            </Field>
          </>
        )}

        <Field label="Description" {...field("description")}>
          <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} className={`${input} py-3`} />
        </Field>

        {error && (
          <p role="alert" className="rounded-xl bg-danger/5 p-3 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-3 border-t border-line pt-6">
          <button disabled={saving} className={btn.primary}>
            {saving ? "Posting…" : kind === "event" ? "Post event" : "Post deal"}
          </button>
          <Link href="/events" className={btn.secondary}>
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

const input = "min-h-11 w-full rounded-xl border border-line bg-surface px-4";

const LABELS: Partial<Record<keyof FlyerFields, string>> = {
  title: "title", starts_at: "start time", ends_at: "end time", location_text: "location", is_free: "cost",
  has_freebie: "freebie", freebie_desc: "what's free", register_url: "RSVP link", org_name: "host", category: "category",
};
const labelFor = (k: keyof FlyerFields) => LABELS[k] ?? k;

function Field({ label, hint, ai, low, missing, children }: { label: string; hint?: string; ai?: boolean; low?: boolean; missing?: boolean; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 rounded-2xl ${low ? "bg-amber-50 p-3 ring-2 ring-amber-400" : missing ? "bg-background p-3 ring-1 ring-dashed ring-line" : ""}`}>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span>{label}</span>
        {ai && !low && <span className="text-xs font-semibold text-cardinal" title="Filled in by AI from the flyer">✨ from flyer</span>}
        {low && <span className="text-xs font-bold text-amber-800">⚠ Double-check this</span>}
        {missing && <span className="text-xs text-muted">Not on the flyer, add it if you know it</span>}
      </div>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Header() {
  return (
    <header className="space-y-1 text-center">
      <p className="text-sm font-semibold text-cardinal">Flyer scanner</p>
      <h1 className="text-3xl font-extrabold">Saw a flyer? Post it in 10 seconds.</h1>
    </header>
  );
}
