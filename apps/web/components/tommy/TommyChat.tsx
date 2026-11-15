"use client";
// P1 Naman: the conversation (bubbles + suggestions + message box). Used by /chat and the floating panel.
import { useEffect, useRef } from "react";

import { Composer } from "@/app/chat/_components/Composer";
import { Message } from "@/app/chat/_components/Message";

import { TommyAvatar } from "./TommyAvatar";
import { useTommyChat } from "./TommyProvider";

export function TommyChat({ prompts, compact = false }: { prompts: string[]; compact?: boolean }) {
  const { messages, busy, send, stop, confirm } = useTommyChat();
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={`flex-1 space-y-4 overflow-y-auto pb-4 ${compact ? "px-3 pt-3" : "pr-1"}`} role="log" aria-label="Conversation with Tommy">
        {messages.length === 0 ? (
          <div className="fade-up flex h-full flex-col items-center justify-center gap-4 text-center">
            <TommyAvatar mood="winking" size={compact ? 76 : 104} className="tommy-wave" />
            <div>
              <p className={`${compact ? "text-base" : "text-lg"} font-bold`}>Fight On! What do you need?</p>
              <p className="text-sm text-muted">Ask a question, report a problem, or snap a photo of a flyer or something you found.</p>
            </div>
            <div className="flex max-w-xl flex-wrap justify-center gap-2">
              {prompts.map((p, i) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  style={{ animationDelay: `${120 + i * 70}ms` }}
                  className="fade-up min-h-11 rounded-full border border-line bg-surface px-4 text-sm font-medium transition hover:-translate-y-0.5 hover:border-cardinal hover:text-cardinal hover:shadow-sm"
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
      <div className={compact ? "border-t border-line bg-background px-3 pb-3 pt-2" : ""}>
        <Composer busy={busy} onSend={send} onStop={stop} />
      </div>
    </div>
  );
}
