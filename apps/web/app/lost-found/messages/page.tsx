"use client";
// P2 Vishwa: My handoffs. Every Lost & Found chat you're in, as owner or finder.
import Link from "next/link";
import { useEffect, useState } from "react";

import { BackLink, ErrorNote, ItemPhoto, SignInNotice } from "../_components/parts";
import { type ThreadSummary, currentUserId, isMock, listThreads, timeAgo } from "../_lib/data";

export default function HandoffsPage() {
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const uid = await currentUserId();
      if (!isMock && !uid) return setSignedOut(true);
      setUserId(uid);
      listThreads()
        .then(setThreads)
        .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    })();
  }, []);

  return (
    <section className="max-w-2xl space-y-5">
      <BackLink href="/lost-found" label="Lost & Found" />
      <div>
        <h1 className="text-3xl font-bold">My handoffs</h1>
        <p className="text-muted">Chats with people returning or picking up everyday items.</p>
      </div>
      {signedOut && <SignInNotice what="see your handoffs" />}
      {error && <ErrorNote message={error} />}
      {!signedOut && !threads && !error && <p className="text-muted">Loading…</p>}
      {threads?.length === 0 && (
        <p className="rounded-lg border border-line bg-surface p-4 text-muted">
          No handoffs yet. When you claim an item, or someone claims one you found, the chat shows up here.
        </p>
      )}
      {threads && threads.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {threads.map((t) => {
            const role = userId && t.finder_id === userId ? "finder" : "owner";
            return (
              <li key={t.id}>
                <Link href={`/lost-found/messages/${t.id}`} className="flex min-h-16 items-center gap-3 p-3 hover:bg-background">
                  <ItemPhoto item={{ title: t.item?.title ?? "Item", photo_url: t.item?.photo_url ?? null }} className="h-14 w-14 shrink-0 rounded-md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{t.item?.title ?? "Item"}</p>
                    <p className="text-sm text-muted">
                      {t.item?.status === "claimed" ? "Returned" : role === "finder" ? "Someone thinks this is theirs" : "You're picking this up"}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted">{timeAgo(t.created_at)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
