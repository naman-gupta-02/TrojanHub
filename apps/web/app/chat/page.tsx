"use client";
// P1 Naman: Tommy chat (streaming bubbles, source chips, confirm cards, photo upload).
import { useEffect, useRef } from "react";

import { Composer } from "./_components/Composer";
import { Message } from "./_components/Message";
import { SUGGESTED_PROMPTS } from "./_lib/chatState";
import { useTommy } from "./_lib/useTommy";

export default function ChatPage() {
  const { messages, busy, send, stop, confirm, reset } = useTommy();
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  return (
    <section className="mx-auto flex h-[calc(100dvh-8.5rem)] max-w-3xl flex-col">
      <div className="flex items-center justify-between pb-3">
        <div>
          <h1 className="text-2xl font-bold">Tommy</h1>
          <p className="text-sm text-muted">Your campus assistant. Answers come from official USC pages.</p>
        </div>
        {messages.length > 0 && (
          <button onClick={reset} disabled={busy} className="min-h-11 shrink-0 whitespace-nowrap rounded-md border border-line px-3 text-sm font-medium disabled:opacity-50">
            New chat
          </button>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto pb-4 pr-1" role="log" aria-label="Conversation with Tommy">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-cardinal text-2xl font-bold text-gold" aria-hidden>
              T
            </div>
            <div>
              <p className="text-lg font-semibold">Fight On! What do you need?</p>
              <p className="text-sm text-muted">Ask a question, report a problem, or snap a photo of a flyer or something you found.</p>
            </div>
            <div className="flex max-w-xl flex-wrap justify-center gap-2">
              {SUGGESTED_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="min-h-11 rounded-full border border-line bg-surface px-4 text-sm hover:border-cardinal hover:text-cardinal"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => <Message key={m.id} msg={m} onConfirm={(actionId, approved, edits) => confirm(m.id, actionId, approved, edits)} />)
        )}
        <div ref={bottom} />
      </div>

      <Composer busy={busy} onSend={send} onStop={stop} />
    </section>
  );
}
