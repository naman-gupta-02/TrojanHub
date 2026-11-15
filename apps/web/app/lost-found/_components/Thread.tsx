"use client";
// P2 Vishwa: private handoff chat between an owner and a finder (Supabase Realtime).
// Only the two people in the thread can read or send (RLS). No phone numbers or emails shown.
import type { Message } from "@trojanhub/shared";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  MEETING_SPOTS,
  type ThreadSummary,
  currentUserId,
  getThread,
  isMock,
  listMessages,
  markReturned,
  sendMessage,
  subscribeToThread,
} from "../_lib/data";
import { BackLink, ErrorNote, SignInNotice } from "./parts";

export function Thread() {
  const { threadId } = useParams<{ threadId: string }>();
  const [thread, setThread] = useState<ThreadSummary | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "signed-out">("loading");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  function add(m: Message) {
    setMessages((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m]));
  }

  useEffect(() => {
    let unsubscribe = () => {};
    let cancelled = false; // the page was left (or re-mounted) before loading finished
    (async () => {
      const uid = await currentUserId();
      if (cancelled) return;
      if (!isMock && !uid) return setState("signed-out");
      setUserId(uid ?? "00000000-0000-0000-0000-000000000001");
      try {
        const [t, msgs] = await Promise.all([getThread(threadId), listMessages(threadId)]);
        if (cancelled) return;
        if (!t) return setState("missing");
        setThread(t);
        setMessages(msgs);
        setState("ready");
        unsubscribe = subscribeToThread(threadId, add);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setState("missing");
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [threadId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function send(text: string) {
    if (!text.trim() || !userId) return;
    setBusy(true);
    setError(null);
    try {
      add(await sendMessage(threadId, userId, text));
      setDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function returned() {
    if (!thread?.item) return;
    try {
      await markReturned(thread.item.id);
      setThread({ ...thread, item: { ...thread.item, status: "claimed" } });
      await send("Marked as returned. Glad it found its way home!");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const back = <BackLink href="/lost-found/messages" label="My handoffs" />;
  if (state === "loading") return <p className="text-muted">Loading…</p>;
  if (state === "signed-out") return <div className="space-y-4">{back}<SignInNotice what="see this chat" /></div>;
  if (state === "missing" || !thread)
    return (
      <div className="space-y-4">
        {back}
        {error ? <ErrorNote message={error} /> : <p>This chat doesn&apos;t exist, or you&apos;re not part of it.</p>}
      </div>
    );

  const isFinder = userId === thread.finder_id;
  const done = thread.item?.status === "claimed";

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-4">
      {back}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{thread.item?.title ?? "Handoff"}</h1>
          <p className="text-sm text-muted">{isFinder ? "You found this item." : "You're picking up this item."}</p>
        </div>
        {thread.item && (
          <Link href={`/lost-found/${thread.item.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-cardinal hover:underline">
            View item
          </Link>
        )}
      </div>

      <p className="rounded-md bg-gold/25 p-3 text-sm">Meet in a busy public place. Don&apos;t share your phone number, address or ID here.</p>

      <div className="flex min-h-64 flex-col gap-2 rounded-lg border border-line bg-surface p-3" aria-live="polite">
        {messages.map((m) => {
          const mine = m.sender_id === userId;
          return (
            <div key={m.id} className={`max-w-[80%] rounded-2xl px-3 py-2 ${mine ? "self-end bg-cardinal text-white" : "self-start bg-background"}`}>
              <span className="sr-only">{mine ? "You: " : "Them: "}</span>
              {m.body}
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      {error && <ErrorNote message={error} />}

      {done ? (
        <p className="rounded-md bg-success/10 p-3 font-semibold text-success">Returned. This handoff is done.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2" aria-label="Suggested meeting spots">
            {MEETING_SPOTS.map((spot) => (
              <button key={spot} onClick={() => setDraft(`Can we meet at ${spot}?`)} className="min-h-11 rounded-full border border-line bg-surface px-3 text-sm hover:bg-background">
                Meet at {spot}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
            className="flex gap-2"
          >
            <label htmlFor="lf-msg" className="sr-only">
              Message
            </label>
            <input
              id="lf-msg"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={1000}
              placeholder="Write a message"
              className="min-h-11 min-w-0 flex-1 rounded-md border border-line bg-surface px-3"
            />
            <button disabled={busy || !draft.trim()} className="min-h-11 rounded-md bg-cardinal px-5 font-semibold text-white hover:bg-cardinal-dark disabled:opacity-60">
              Send
            </button>
          </form>
          {isFinder && (
            <button onClick={returned} className="min-h-11 self-start rounded-md border border-line px-4 text-sm font-semibold hover:bg-background">
              They have it: mark as returned
            </button>
          )}
        </>
      )}
    </section>
  );
}
