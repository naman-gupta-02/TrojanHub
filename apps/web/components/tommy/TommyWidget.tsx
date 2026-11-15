"use client";
// P1 Naman: "Chat with Tommy" button on every page. Opens a chat panel with phrases for that page.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { moodFor, promptsFor } from "@/app/chat/_lib/chatState";

import { TommyAvatar } from "./TommyAvatar";
import { TommyChat } from "./TommyChat";
import { useTommyChat } from "./TommyProvider";

export function TommyWidget() {
  const path = usePathname();
  const { open, setOpen, messages, busy, reset, send } = useTommyChat();
  const prompts = promptsFor(path);
  const [nudge, setNudge] = useState<{ path: string | null; text: string } | null>(null);
  const teaser = nudge && nudge.path === path ? nudge.text : null; // only on the page it was for
  const setTeaser = (text: string | null) => setNudge(text ? { path, text } : null);
  const lastReply = [...messages].reverse().find((m) => m.role === "assistant");

  // A friendly nudge with a phrase for this page, a moment after the page opens.
  useEffect(() => {
    if (open || messages.length > 0) return;
    const show = setTimeout(() => setNudge({ path, text: prompts[0] }), 1800);
    const hide = setTimeout(() => setNudge(null), 11000);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per page
  }, [path]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (path?.startsWith("/chat") || path?.startsWith("/login")) return null;

  return (
    <>
      {open && (
        <section
          role="dialog"
          aria-label="Chat with Tommy"
          className="panel-in fixed inset-x-0 bottom-0 z-50 flex h-[85dvh] flex-col overflow-hidden rounded-t-3xl border border-line bg-background shadow-2xl sm:inset-x-auto sm:bottom-24 sm:right-6 sm:h-[min(640px,calc(100dvh-8rem))] sm:w-[400px] sm:rounded-3xl"
        >
          <header className="flex items-center gap-3 bg-cardinal px-4 py-3 text-white">
            <TommyAvatar mood={busy ? "searching" : moodFor(lastReply)} size={40} />
            <div className="min-w-0 flex-1">
              <p className="font-extrabold leading-tight">Tommy</p>
              <p className="truncate text-xs text-white/80">{busy ? "On it…" : "Your AI campus buddy · answers from USC pages"}</p>
            </div>
            {messages.length > 0 && (
              <button onClick={reset} disabled={busy} className="rounded-full px-3 py-1.5 text-xs font-semibold hover:bg-white/15 disabled:opacity-50">
                New chat
              </button>
            )}
            <Link href="/chat" onClick={() => setOpen(false)} className="rounded-full px-2 py-1.5 text-xs font-semibold hover:bg-white/15" title="Open full screen">
              ⤢
            </Link>
            <button onClick={() => setOpen(false)} aria-label="Close chat" className="grid h-9 w-9 place-items-center rounded-full text-lg hover:bg-white/15">
              ✕
            </button>
          </header>
          {messages.length > 0 && (
            <div className="flex gap-2 overflow-x-auto border-b border-line bg-surface px-3 py-2">
              {prompts.map((p) => (
                <button key={p} onClick={() => send(p)} disabled={busy} className="shrink-0 rounded-full border border-line px-3 py-1 text-xs hover:border-cardinal hover:text-cardinal disabled:opacity-50">
                  {p}
                </button>
              ))}
            </div>
          )}
          <TommyChat prompts={prompts} compact />
        </section>
      )}

      <div className="fixed bottom-5 right-4 z-50 flex flex-col items-end gap-2 sm:right-6">
        {teaser && !open && (
          <button
            onClick={() => {
              setTeaser(null);
              setOpen(true);
              send(teaser);
            }}
            className="teaser-in max-w-[260px] rounded-2xl rounded-br-sm border border-line bg-surface px-4 py-2.5 text-left text-sm shadow-lg hover:border-cardinal"
          >
            <span className="block text-xs font-semibold text-cardinal">Try asking Tommy</span>“{teaser}”
          </button>
        )}
        <button
          onClick={() => {
            setTeaser(null);
            setOpen(!open);
          }}
          aria-expanded={open}
          aria-label={open ? "Close chat with Tommy" : "Chat with Tommy, our AI"}
          className="tommy-launch group flex items-center gap-2 rounded-full bg-cardinal py-1.5 pl-1.5 pr-4 font-bold text-white shadow-xl ring-2 ring-gold transition hover:-translate-y-0.5 hover:bg-cardinal-dark active:scale-95"
        >
          <TommyAvatar mood={busy ? "searching" : open ? "winking" : "default"} size={44} className="ring-0 transition-transform group-hover:rotate-[-8deg]" />
          <span className="text-sm">{open ? "Close" : <>Chat with <span className="text-gold">Tommy</span></>}</span>
        </button>
      </div>
    </>
  );
}
