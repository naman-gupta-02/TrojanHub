"use client";
// P2 Vishwa: "I found something". Photo + where it was found -> AI sorts it -> posted.
// Valuables get the DPS drop-off card; when the AI isn't sure, the finder answers one question.
import type { CreateItemResponse, Item, ItemTier } from "@trojanhub/shared";
import { ApiRequestError } from "@trojanhub/shared/api";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";

import { BackLink, DropoffCard, ErrorNote, ItemPhoto, SignInNotice, TierBadge } from "../_components/parts";
import { DPS_DROPOFF, currentUserId, isMock, setTier, shrinkPhoto } from "../_lib/data";

export default function ReportFoundPage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(isMock ? true : null);
  const [photo, setPhoto] = useState<{ blob: Blob; preview: string } | null>(null);
  const [description, setDescription] = useState("");
  const [where, setWhere] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState<CreateItemResponse | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isMock) currentUserId().then((uid) => setSignedIn(!!uid));
  }, []);

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const blob = await shrinkPhoto(file);
      if (photo) URL.revokeObjectURL(photo.preview);
      setPhoto({ blob, preview: URL.createObjectURL(blob) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!photo && !description.trim()) return setError("Add a photo or a short description of the item.");
    if (!where.trim()) return setError("Where did you find it? For example: Leavey Library, 2nd floor.");
    setBusy(true);
    setError(null);
    try {
      const res = await api.items.create(
        { kind: "found", description: description.trim() || undefined, location_text: where.trim() },
        photo?.blob,
      );
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
        <h1 className="text-3xl font-bold">I found something</h1>
        <SignInNotice what="post a found item" />
      </section>
    );
  }

  if (posted) return <Posted initial={posted} />;

  return (
    <section className="max-w-2xl space-y-5">
      <BackLink href="/lost-found" label="Lost & Found" />
      <div>
        <h1 className="text-3xl font-bold">I found something</h1>
        <p className="text-muted">Snap a photo and say where you found it. Our AI sorts it for you.</p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <span className="block font-semibold">Photo</span>
          {photo ? (
            <div className="flex items-end gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.preview} alt="Your photo of the item" className="h-40 w-40 rounded-lg border border-line object-cover" />
              <button type="button" onClick={() => fileInput.current?.click()} className="min-h-11 rounded-md border border-line bg-surface px-4 font-semibold hover:bg-background">
                Change photo
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex h-40 w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-line bg-surface font-semibold hover:border-cardinal"
            >
              Take or choose a photo
              <span className="text-sm font-normal text-muted">Don&apos;t include faces or ID card details</span>
            </button>
          )}
          <input ref={fileInput} type="file" accept="image/*" capture="environment" className="hidden" aria-label="Photo of the item" onChange={(e) => pickPhoto(e.target.files?.[0])} />
        </div>

        <label className="block space-y-1">
          <span className="font-semibold">What is it?</span> <span className="text-sm text-muted">(optional with a photo)</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. black Hydro Flask with a Trojans sticker"
            className="min-h-11 w-full rounded-md border border-line bg-surface px-3"
          />
        </label>

        <label className="block space-y-1">
          <span className="font-semibold">Where did you find it?</span>
          <input
            value={where}
            onChange={(e) => setWhere(e.target.value)}
            required
            placeholder="e.g. Leavey Library, 2nd floor"
            className="min-h-11 w-full rounded-md border border-line bg-surface px-3"
          />
        </label>

        {error && <ErrorNote message={error} />}

        <button disabled={busy} className="min-h-11 w-full rounded-md bg-cardinal font-semibold text-white hover:bg-cardinal-dark disabled:opacity-60">
          {busy ? "Looking at your photo…" : "Post it"}
        </button>
        <p className="text-xs text-muted">Your name, email and phone number are never shown. Owners contact you through in-app messages.</p>
      </form>
    </section>
  );
}

function Posted({ initial }: { initial: CreateItemResponse }) {
  const [item, setItem] = useState<Item>(initial.item);
  const [asking, setAsking] = useState(!!initial.ask_tier);
  const [error, setError] = useState<string | null>(null);
  const dropoff = item.tier === "valuable" ? initial.dropoff ?? DPS_DROPOFF : null;

  async function answer(tier: ItemTier) {
    setError(null);
    try {
      if (tier !== item.tier) setItem(await setTier(item, tier));
      setAsking(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
        </div>
      </div>

      {asking && (
        <div className="space-y-3 rounded-lg border-2 border-gold bg-surface p-4">
          <p className="font-semibold">Quick check: is this a valuable?</p>
          <p className="text-sm text-muted">For example a phone, laptop, wallet, ID, keys, AirPods, or a bag that might have those inside.</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => answer("valuable")} className="min-h-11 rounded-md bg-cardinal px-4 font-semibold text-white hover:bg-cardinal-dark">
              Yes, it&apos;s valuable
            </button>
            <button onClick={() => answer("everyday")} className="min-h-11 rounded-md border border-line px-4 font-semibold hover:bg-background">
              No, it&apos;s an everyday item
            </button>
          </div>
        </div>
      )}
      {error && <ErrorNote message={error} />}

      {!asking &&
        (dropoff ? (
          <DropoffCard dropoff={dropoff} title="This looks valuable. Please take it to DPS.">
            <p className="text-sm">DPS keeps valuables safe and checks who really owns them. Owners who search will be told to pick it up there.</p>
          </DropoffCard>
        ) : (
          <div className="rounded-lg border border-line bg-surface p-4 text-sm">
            <p className="font-semibold">You can hold on to it.</p>
            <p className="text-muted">
              Owners who search will find it. When someone taps “This is mine”, you&apos;ll see a message in{" "}
              <Link href="/lost-found/messages" className="font-semibold text-cardinal underline">
                My handoffs
              </Link>
              . The post comes down after 14 days.
            </p>
          </div>
        ))}

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
