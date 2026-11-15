"use client";
// P2 Vishwa: "I found something". Photo + where it was found -> posted. Then the finder says
// where the item is now: taken to DPS, or left where found (the AI pre-selects one).
import type { Building, CreateItemResponse, Item, ItemTier } from "@trojanhub/shared";
import { ApiRequestError } from "@trojanhub/shared/api";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";

import { BackLink, DropoffCard, ErrorNote, ItemPhoto, LeftHereCard, SignInNotice, TierBadge, WhereNowChoice } from "../_components/parts";
import { DPS_DROPOFF, currentUserId, getBuildings, isMock, setTier, shrinkPhoto } from "../_lib/data";

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

  if (posted) return <Posted initial={posted} photoGiven={!!photo} />;

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
          <span className="font-semibold">Where did you find it?</span>{" "}
          <span className="text-sm text-muted">(be specific: if you leave it there, owners will go to this spot)</span>
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
        <p className="text-xs text-muted">Your name, email and phone number are never shown.</p>
      </form>
    </section>
  );
}

function Posted({ initial, photoGiven }: { initial: CreateItemResponse; photoGiven: boolean }) {
  const [item, setItem] = useState<Item>(initial.item);
  const [busy, setBusy] = useState(false);
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
        </div>
      </div>

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
