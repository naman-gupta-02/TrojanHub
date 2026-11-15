"use client";
// P2 Vishwa: one found item + "This is mine".
import type { Building, DropoffInfo, Item } from "@trojanhub/shared";
import { ApiRequestError } from "@trojanhub/shared/api";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";

import { DPS_DROPOFF, currentUserId, getBuildings, getItem, isMock, markReturned, timeAgo, whereFound } from "../_lib/data";
import { BackLink, DropoffCard, ErrorNote, ItemPhoto, SignInNotice, TierBadge } from "./parts";

export function ItemDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [state, setState] = useState<"loading" | "ready" | "missing" | "signed-out">("loading");
  const [item, setItem] = useState<Item | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [buildings, setBuildings] = useState<Record<string, Building>>({});
  const [pickup, setPickup] = useState<DropoffInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const uid = await currentUserId();
      if (!isMock && !uid) return setState("signed-out");
      setUserId(uid);
      try {
        const [it, bs] = await Promise.all([getItem(id), getBuildings()]);
        setBuildings(bs);
        setItem(it);
        setState(it ? "ready" : "missing");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setState("missing");
      }
    })();
  }, [id]);

  async function claim() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.items.claim(id);
      if ("thread_id" in res) router.push(`/lost-found/messages/${res.thread_id}`);
      else setPickup(res.pickup);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "Couldn't claim right now. Is the AI service running?");
    } finally {
      setBusy(false);
    }
  }

  async function returned() {
    if (!item) return;
    setBusy(true);
    try {
      await markReturned(item.id);
      setItem({ ...item, status: "claimed" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
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

  return (
    <article className="space-y-5">
      {back}
      <div className="grid gap-6 md:grid-cols-2">
        <ItemPhoto item={item} className="aspect-square w-full rounded-lg border border-line" />
        <div className="space-y-4">
          <div className="space-y-2">
            <TierBadge tier={item.tier} />
            <h1 className="text-3xl font-bold">{item.title}</h1>
            {item.description && <p>{item.description}</p>}
          </div>
          <dl className="space-y-1 text-sm">
            <div>
              <dt className="inline font-semibold">Found at: </dt>
              <dd className="inline">{whereFound(item, buildings)}</dd>
            </div>
            <div>
              <dt className="inline font-semibold">Posted: </dt>
              <dd className="inline">{timeAgo(item.created_at)}</dd>
            </div>
            {item.tier === "everyday" && item.expires_at && open && (
              <div>
                <dt className="inline font-semibold">Listed until: </dt>
                <dd className="inline">{new Date(item.expires_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" })}</dd>
              </div>
            )}
          </dl>

          {error && <ErrorNote message={error} />}

          {!open ? (
            <p className="rounded-md bg-success/10 p-3 font-semibold text-success">This item was returned to its owner.</p>
          ) : mine ? (
            <div className="space-y-3 rounded-lg border border-line bg-surface p-4">
              <p className="font-semibold">You posted this item.</p>
              {item.tier === "valuable" ? (
                <DropoffCard dropoff={DPS_DROPOFF} title="Please take it to DPS if you haven't yet." />
              ) : (
                <>
                  <p className="text-sm text-muted">When someone claims it, you&apos;ll chat in My handoffs. Mark it returned once they have it.</p>
                  <button onClick={returned} disabled={busy} className="min-h-11 rounded-md border border-line px-4 font-semibold hover:bg-background disabled:opacity-60">
                    Mark as returned
                  </button>
                </>
              )}
            </div>
          ) : pickup ? (
            <DropoffCard dropoff={pickup} title="Pick it up at DPS Lost & Found">
              <p className="text-sm">Valuables are kept at DPS, which checks who really owns them. Contact DPS to claim it.</p>
            </DropoffCard>
          ) : (
            <div className="space-y-2">
              <button onClick={claim} disabled={busy} className="min-h-11 w-full rounded-md bg-cardinal px-4 font-semibold text-white hover:bg-cardinal-dark disabled:opacity-60">
                {busy ? "One sec…" : "This is mine"}
              </button>
              <p className="text-xs text-muted">
                {item.tier === "valuable"
                  ? "We'll show you where to pick it up."
                  : "This opens a private chat with the finder. No phone numbers or emails are shared."}
              </p>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
