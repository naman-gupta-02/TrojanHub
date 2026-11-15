"use client";
// P2 Vishwa: "I found something". Photo + where it was found -> posted. Then the finder says
// where the item is now: taken to DPS, or left where found (the AI pre-selects one).
import type { Building, CreateItemResponse, Item, ItemTier } from "@trojanhub/shared";
import { ApiRequestError } from "@trojanhub/shared/api";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { TommyAvatar } from "@/components/tommy/TommyAvatar";
import { api } from "@/lib/api";

import { EditItem } from "../_components/EditItem";
import { BackLink, DropoffCard, ErrorNote, ItemPhoto, LeftHereCard, SignInNotice, TierBadge, WhereNowChoice } from "../_components/parts";
import { DPS_DROPOFF, currentUserId, getBuildings, isMock, setTier, shrinkPhoto } from "../_lib/data";

export default function ReportFoundPage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(isMock ? true : null);
  const [photo, setPhoto] = useState<{ blob: Blob; preview: string } | null>(null);
  const [description, setDescription] = useState("");
  const [describing, setDescribing] = useState(false);
  const [aiWrote, setAiWrote] = useState(false); // the box holds Tommy's text (maybe edited)
  const lastAi = useRef<string | null>(null);
  const typed = useRef(""); // what's in the box right now, for the async describe below
  const describeRun = useRef(0); // ignore an answer for a photo that was already replaced
  const pendingDescribe = useRef<Promise<void> | null>(null); // "Post it" waits for this
  const [where, setWhere] = useState("");
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false); // posting, but Tommy is still writing the description
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState<CreateItemResponse | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isMock) currentUserId().then((uid) => setSignedIn(!!uid));
  }, []);

  // Next.js keeps this page alive in the background (cacheComponents / <Activity>), so coming back
  // would show the last "Posted" screen. Once something was posted, start fresh when the page is left.
  // An unsent draft is kept. (next/dist/docs: "Preserving UI state" > forms)
  useLayoutEffect(() => {
    if (!posted) return;
    return () => {
      setPosted(null);
      setPhoto((p) => {
        if (p) URL.revokeObjectURL(p.preview);
        return null;
      });
      setDescription("");
      typed.current = "";
      setAiWrote(false);
      lastAi.current = null;
      pendingDescribe.current = null;
      // a counter, not a DOM ref: bumping it makes a describe that's still running drop its answer
      // eslint-disable-next-line react-hooks/exhaustive-deps
      describeRun.current++;
      setWhere("");
      setError(null);
    };
  }, [posted]);

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("That's not a photo. Try a JPG or PNG.");
    setError(null);
    try {
      const blob = await shrinkPhoto(file);
      if (photo) URL.revokeObjectURL(photo.preview);
      setPhoto({ blob, preview: URL.createObjectURL(blob) });
      void autoDescribe(blob);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  /** Tommy writes "What is it?" from the photo. It never overwrites what the finder typed;
   *  if it fails, the box just stays as it was. */
  function autoDescribe(blob: Blob, force = false): Promise<void> {
    const run = ++describeRun.current;
    setDescribing(true);
    const job = (async () => {
      try {
        const res = await api.items.describe(blob);
        if (run !== describeRun.current || !res.description) return;
        const cur = typed.current;
        if (!force && cur.trim() && cur !== lastAi.current) return; // the finder already wrote their own
        lastAi.current = typed.current = res.description;
        setDescription(res.description);
        setAiWrote(true);
      } catch {
        // optional helper: the finder can still type it
      } finally {
        if (run === describeRun.current) {
          setDescribing(false);
          pendingDescribe.current = null;
        }
      }
    })();
    pendingDescribe.current = job;
    return job;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!where.trim()) return setError("Where did you find it? For example: Leavey Library, 2nd floor.");
    setError(null);
    // Pressed "Post it" before Tommy finished? Wait for the description instead of posting without one.
    if (!typed.current.trim() && pendingDescribe.current) {
      setWaiting(true);
      await pendingDescribe.current;
      setWaiting(false);
    }
    const text = typed.current.trim();
    if (!photo && !text) return setError("Add a photo or a short description of the item.");
    setBusy(true);
    try {
      const res = await api.items.create({ kind: "found", description: text || undefined, location_text: where.trim() }, photo?.blob);
      setPosted(res);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "Couldn't post right now. Is the AI service running?");
    } finally {
      setBusy(false);
    }
  }

  if (signedIn === false) {
    return (
      <section className="max-w-2xl space-y-4">
        <BackLink href="/lost-found" label="Lost & Found" />
        <h1 className="text-3xl font-black">I found something</h1>
        <SignInNotice what="post a found item" />
      </section>
    );
  }

  if (posted) return <Posted initial={posted} photoGiven={!!photo} />;

  const input = "lf-input w-full rounded-xl border-2 border-line bg-surface px-4";
  return (
    <section className="max-w-2xl space-y-5">
      <BackLink href="/lost-found" label="Lost & Found" />
      <div className="lf-hero relative overflow-hidden rounded-3xl p-6 text-white shadow-lg">
        <span aria-hidden className="pointer-events-none absolute -right-4 -top-6 select-none text-[7.5rem] leading-none opacity-10">
          📸
        </span>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-gold">Lost &amp; Found</p>
        <h1 className="text-3xl font-black tracking-tight sm:text-4xl">I found something</h1>
        <p className="mt-1 text-white/85">Snap a photo and say where you found it. Tommy writes the description and sorts it for you.</p>
      </div>

      <form onSubmit={submit} className="space-y-6 rounded-3xl border border-line bg-surface p-5 shadow-sm sm:p-6">
        <Step n={1} title="Photo" hint="Don't include faces or ID card details">
          {photo ? (
            <div className="space-y-2">
              <div className={`relative overflow-hidden rounded-2xl border-2 shadow-md ${describing ? "lf-scan border-gold" : "border-line"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.preview} alt="Your photo of the item" className="max-h-80 w-full bg-background object-contain" />
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/60 to-transparent p-3 pt-10">
                  {describing ? (
                    <span className="fade-up inline-flex items-center gap-2 rounded-full bg-white/95 py-1 pl-1 pr-3 text-sm font-bold text-ink shadow">
                      <TommyAvatar mood="searching" size={28} /> Tommy is looking…
                    </span>
                  ) : aiWrote ? (
                    <span className="tommy-pop inline-flex items-center gap-2 rounded-full bg-gold py-1 pl-1 pr-3 text-sm font-bold text-ink shadow">
                      <TommyAvatar mood="celebrating" size={28} /> Described by Tommy
                    </span>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    className="min-h-10 rounded-full bg-white/95 px-4 text-sm font-bold text-ink shadow transition hover:bg-white"
                  >
                    🔄 Change photo
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                pickPhoto(e.dataTransfer.files?.[0]);
              }}
              className={`lf-drop group flex h-52 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gold bg-surface ${dragOver ? "is-over" : ""}`}
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-cardinal text-2xl text-white shadow-md transition group-hover:scale-110">
                📷
              </span>
              <span className="text-lg font-bold">Take or choose a photo</span>
              <span className="text-sm text-muted">or drag it here · Tommy will describe it for you</span>
            </button>
          )}
          <input ref={fileInput} type="file" accept="image/*" capture="environment" className="hidden" aria-label="Photo of the item" onChange={(e) => pickPhoto(e.target.files?.[0])} />
        </Step>

        <Step n={2} title="What is it?" hint={photo ? "Tommy writes this from your photo. Check it." : "optional with a photo"} htmlFor="item-description">
          <textarea
            id="item-description"
            value={description}
            onChange={(e) => {
              typed.current = e.target.value;
              setDescription(e.target.value);
            }}
            rows={3}
            placeholder={describing ? "Tommy is looking at your photo…" : "e.g. black Hydro Flask with a Trojans sticker"}
            aria-busy={describing}
            className={`${input} py-3 ${describing && !description ? "animate-pulse bg-gold/5" : ""}`}
          />
          {describing ? (
            <p className="flex items-center gap-2 text-sm font-semibold text-warning" role="status">
              <span className="inline-block h-2 w-2 animate-ping rounded-full bg-gold" aria-hidden /> Tommy is describing your photo…
            </p>
          ) : aiWrote && photo && description.trim() ? (
            <p className="flex flex-wrap items-center gap-x-3 text-sm text-muted" role="status">
              <span>✨ Written by Tommy. Fix anything that&apos;s wrong.</span>
              <button type="button" onClick={() => autoDescribe(photo.blob, true)} className="font-bold text-cardinal hover:underline">
                ↻ Rewrite
              </button>
            </p>
          ) : null}
        </Step>

        <Step n={3} title="Where did you find it?" hint="Be specific: if you leave it there, owners will go to this spot" htmlFor="item-where">
          <input
            id="item-where"
            value={where}
            onChange={(e) => setWhere(e.target.value)}
            required
            placeholder="e.g. Leavey Library, 2nd floor"
            className={`${input} min-h-12`}
          />
        </Step>

        {error && <ErrorNote message={error} />}

        <button
          disabled={busy || waiting}
          className="min-h-12 w-full rounded-full bg-cardinal text-lg font-bold text-white shadow-md transition hover:-translate-y-0.5 hover:bg-cardinal-dark hover:shadow-lg disabled:translate-y-0 disabled:opacity-70"
        >
          {waiting ? "✨ Tommy is finishing the description…" : busy ? "Posting…" : "Post it"}
        </button>
        <p className="text-center text-xs text-muted">🔒 Your name, email and phone number are never shown.</p>
      </form>
    </section>
  );
}

/** One numbered step of the form: gold number, bold title, short hint. */
function Step({ n, title, hint, htmlFor, children }: { n: number; title: string; hint?: string; htmlFor?: string; children: React.ReactNode }) {
  const Title = htmlFor ? "label" : "span";
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-3">
        <span className="flex h-7 w-7 shrink-0 translate-y-1 items-center justify-center rounded-full bg-gold text-sm font-black text-ink shadow-sm" aria-hidden>
          {n}
        </span>
        <div>
          <Title htmlFor={htmlFor} className="text-lg font-bold">
            {title}
          </Title>
          {hint && <p className="text-sm text-muted">{hint}</p>}
        </div>
      </div>
      <div className="sm:pl-10">{children}</div>
    </div>
  );
}

function Posted({ initial, photoGiven }: { initial: CreateItemResponse; photoGiven: boolean }) {
  const [item, setItem] = useState<Item>(initial.item);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buildings, setBuildings] = useState<Record<string, Building>>({});

  useEffect(() => {
    getBuildings().then(setBuildings);
  }, []);

  /** Show the new choice right away, save in the background, undo if the save fails. */
  async function choose(tier: ItemTier) {
    if (tier === item.tier) return;
    const prev = item;
    setItem({ ...prev, tier });
    setBusy(true);
    setError(null);
    try {
      setItem(await setTier(prev, tier));
    } catch (e) {
      setItem(prev);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="max-w-2xl space-y-5">
      <BackLink href="/lost-found" label="Lost & Found" />
      <h1 className="text-3xl font-bold">Posted. Thank you!</h1>

      <div className="flex gap-4 rounded-lg border border-line bg-surface p-4">
        <ItemPhoto item={item} className="h-28 w-28 shrink-0 rounded-md" />
        <div className="space-y-1.5">
          <TierBadge tier={item.tier} />
          <p className="text-lg font-semibold">{item.title}</p>
          {item.description && <p className="text-sm text-muted">{item.description}</p>}
          <p className="text-sm text-muted">{item.location_text}</p>
          {!editing && (
            <button onClick={() => setEditing(true)} className="min-h-11 text-sm font-semibold text-cardinal hover:underline">
              Edit details
            </button>
          )}
        </div>
      </div>

      {editing && (
        <EditItem
          item={item}
          onSaved={(saved) => {
            setItem(saved);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      )}

      {photoGiven && !item.photo_url && (
        <p className="rounded-md bg-gold/25 p-3 text-sm">We didn&apos;t save your photo: ID and bank cards show private info. The item is still posted.</p>
      )}

      <WhereNowChoice tier={item.tier} onChange={choose} busy={busy} />
      <p className="text-sm text-muted">
        {initial.ask_tier
          ? "We weren't sure about this one. If it might hold something valuable (like a bag), DPS is safer."
          : `We picked this from your photo. Tap the other option if that's not right.`}
      </p>
      {error && <ErrorNote message={error} />}

      {item.tier === "valuable" ? (
        <DropoffCard dropoff={initial.dropoff ?? DPS_DROPOFF} title="Please take it to DPS Lost & Found.">
          <p className="text-sm">DPS keeps found items for 90 days and checks who really owns them. Owners who search will be sent there.</p>
        </DropoffCard>
      ) : (
        <LeftHereCard item={item} buildings={buildings} title="Owners who search will be told it's here:">
          <p className="text-sm text-muted">The post comes down after 14 days. If you move it, open your post and remove it.</p>
        </LeftHereCard>
      )}

      <div className="flex flex-wrap gap-2">
        <Link href={`/lost-found/${item.id}`} className="inline-flex min-h-11 items-center rounded-md border border-line bg-surface px-4 font-semibold hover:bg-background">
          View post
        </Link>
        <Link href="/lost-found" className="inline-flex min-h-11 items-center rounded-md border border-line bg-surface px-4 font-semibold hover:bg-background">
          Back to Lost &amp; Found
        </Link>
      </div>
    </section>
  );
}
