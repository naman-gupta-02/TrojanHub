"use client";
// P2 Vishwa: one found item. Owners see right away where to get it: DPS, or the spot the finder
// left it. The finder can switch that, or take the post down.
import type { Building, Item, ItemTier } from "@trojanhub/shared";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { DPS_DROPOFF, currentUserId, getBuildings, getItem, isMock, removePost, setTier, timeAgo } from "../_lib/data";
import { EditItem } from "./EditItem";
import { BackLink, DropoffCard, ErrorNote, ItemPhoto, LeftHereCard, SignInNotice, TierBadge, WhereNowChoice } from "./parts";

export function ItemDetail() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<"loading" | "ready" | "missing" | "signed-out">("loading");
  const [item, setItem] = useState<Item | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [buildings, setBuildings] = useState<Record<string, Building>>({});
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const uid = await currentUserId();
      if (cancelled) return;
      if (!isMock && !uid) return setState("signed-out");
      setUserId(uid);
      try {
        const [it, bs] = await Promise.all([getItem(id), getBuildings()]);
        if (cancelled) return;
        setBuildings(bs);
        setItem(it);
        setState(it ? "ready" : "missing");
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setState("missing");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  /** Show the new choice right away, save in the background, undo if the save fails. */
  function changeTier(prev: Item, tier: ItemTier) {
    if (tier === prev.tier) return;
    setItem({ ...prev, tier });
    run(async () => {
      try {
        setItem(await setTier(prev, tier));
      } catch (e) {
        setItem(prev);
        throw e;
      }
    });
  }

  const back = <BackLink href="/lost-found" label="Lost & Found" />;
  if (state === "loading") return <p className="text-muted">Loading…</p>;
  if (state === "signed-out") return <div className="space-y-4">{back}<SignInNotice what="see this item" /></div>;
  if (state === "missing" || !item)
    return (
      <div className="space-y-4">
        {back}
        {error ? <ErrorNote message={error} /> : <p>This item doesn&apos;t exist or was removed.</p>}
      </div>
    );

  const mine = !!userId && item.posted_by === userId;
  const open = item.status === "open";
  const atDps = item.tier === "valuable";

  return (
    <div className="page-in space-y-5">
      {back}
      <div className="grid gap-6 md:grid-cols-2">
        <ItemPhoto item={item} className="aspect-square w-full rounded-3xl border border-line shadow-md" />
        <div className="space-y-4">
          <div className="space-y-2">
            <TierBadge tier={item.tier} />
            <h1 className="text-3xl font-black tracking-tight">{item.title}</h1>
            {item.description && <p className="border-l-4 border-gold pl-3 text-lg">{item.description}</p>}
            <p className="text-sm text-muted">Posted {timeAgo(item.created_at)}</p>
          </div>

          {error && <ErrorNote message={error} />}

          {!open ? (
            <p className="rounded-md bg-success/10 p-3 font-semibold text-success">This post was taken down: the item was picked up or moved.</p>
          ) : mine ? (
            <div className="space-y-4 rounded-2xl border border-line bg-surface p-4 shadow-sm">
              <p className="font-semibold">You posted this item.</p>
              {editing ? (
                <EditItem
                  item={item}
                  onSaved={(saved) => {
                    setItem(saved);
                    setEditing(false);
                  }}
                  onCancel={() => setEditing(false)}
                />
              ) : (
                <button onClick={() => setEditing(true)} className="min-h-11 rounded-md border border-line px-4 font-semibold hover:bg-background">
                  Edit details
                </button>
              )}
              <WhereNowChoice tier={item.tier} busy={busy} onChange={(t: ItemTier) => changeTier(item, t)} />
              <button
                onClick={() => run(async () => { await removePost(item.id); setItem({ ...item, status: "claimed" }); })}
                disabled={busy}
                className="min-h-11 rounded-md border border-line px-4 font-semibold hover:bg-background disabled:opacity-60"
              >
                Take this post down
              </button>
              <p className="text-xs text-muted">Do this once it&apos;s been picked up, or if you moved it somewhere else.</p>
            </div>
          ) : atDps ? (
            <DropoffCard dropoff={DPS_DROPOFF} title="The finder took this to DPS Lost & Found">
              <p className="text-sm">If it&apos;s yours, go to DPS. It should be there: DPS keeps found items for 90 days and checks who really owns them.</p>
              <p className="text-sm text-muted">
                To protect the owner, the photo and details are hidden. Be ready to describe it (color, case, stickers, what&apos;s inside) to prove it&apos;s yours.
              </p>
            </DropoffCard>
          ) : (
            <LeftHereCard item={item} buildings={buildings} title="The finder left it here:">
              <p className="text-sm text-muted">Go soon, since someone may move it. If it&apos;s not there, ask the building&apos;s front desk or DPS Lost &amp; Found.</p>
            </LeftHereCard>
          )}
        </div>
      </div>
    </div>
  );
}
