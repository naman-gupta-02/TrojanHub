"use client";
// P1 Naman: Tommy full screen. Same conversation as the floating "Chat with Tommy" panel.
import { moodFor, SUGGESTED_PROMPTS } from "./_lib/chatState";
import { TommyAvatar } from "@/components/tommy/TommyAvatar";
import { TommyChat } from "@/components/tommy/TommyChat";
import { useTommyChat } from "@/components/tommy/TommyProvider";

export default function ChatPage() {
  const { messages, busy, reset } = useTommyChat();
  const lastReply = [...messages].reverse().find((m) => m.role === "assistant");

  return (
    <section className="mx-auto flex h-[calc(100dvh-9.5rem)] max-w-3xl flex-col">
      <div className="flex items-center justify-between gap-3 pb-3">
        <div className="flex items-center gap-3">
          <TommyAvatar mood={busy ? "searching" : moodFor(lastReply)} size={52} />
          <div>
            <h1 className="text-2xl font-extrabold">Chat with Tommy</h1>
            <p className="text-sm text-muted">Your AI campus buddy. Answers come from official USC pages.</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button onClick={reset} disabled={busy} className="min-h-11 shrink-0 whitespace-nowrap rounded-md border border-line px-3 text-sm font-medium disabled:opacity-50">
            New chat
          </button>
        )}
      </div>
      <TommyChat prompts={SUGGESTED_PROMPTS} />
    </section>
  );
}
