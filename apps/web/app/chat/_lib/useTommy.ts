"use client";
// React hook for Tommy on the web: send, stream, confirm, stop.
import { useCallback, useRef, useState } from "react";

import { api } from "@/lib/api";

import { applyEvent, assistantPlaceholder, newSessionId, updateConfirm, userMessage, type ChatMsg } from "./chatState";

export function useTommy() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const sessionRef = useRef<string>("");
  const abort = useRef<AbortController | null>(null);

  /** One session id per browser tab, created on first use (not during render). */
  const session = useCallback(() => {
    if (!sessionRef.current) {
      try {
        sessionRef.current = sessionStorage.getItem("tommy-session") || newSessionId();
        sessionStorage.setItem("tommy-session", sessionRef.current);
      } catch {
        sessionRef.current = newSessionId();
      }
    }
    return sessionRef.current;
  }, []);

  const patch = useCallback((id: string, fn: (m: ChatMsg) => ChatMsg) => {
    setMessages((ms) => ms.map((m) => (m.id === id ? fn(m) : m)));
  }, []);

  const send = useCallback(
    async (text: string, image?: { url: string; previewUri: string }) => {
      const message = text.trim() || (image ? "Here's a photo." : "");
      if (!message || busy) return;
      const reply = assistantPlaceholder();
      setMessages((ms) => [...ms, userMessage(message, image?.previewUri), reply]);
      setBusy(true);
      abort.current = new AbortController();
      try {
        for await (const ev of api.chat.stream({ session_id: session(), message, image_url: image?.url }, abort.current.signal)) {
          patch(reply.id, (m) => applyEvent(m, ev));
        }
      } catch (e) {
        const aborted = e instanceof DOMException && e.name === "AbortError";
        patch(reply.id, (m) => ({
          ...m,
          error: aborted ? undefined : "I couldn't reach the TrojanHub server. Check that the AI service is running.",
        }));
      } finally {
        patch(reply.id, (m) => ({ ...m, streaming: false, tools: m.tools.map((t) => ({ ...t, done: true })) }));
        setBusy(false);
        abort.current = null;
      }
    },
    [busy, patch, session],
  );

  const stop = useCallback(() => abort.current?.abort(), []);

  const confirm = useCallback(
    async (msgId: string, actionId: string, approved: boolean, edits?: Record<string, unknown>) => {
      patch(msgId, (m) => updateConfirm(m, actionId, { status: "sending" }));
      try {
        const res = await api.chat.confirm({ session_id: session(), action_id: actionId, approved, edits });
        patch(msgId, (m) => updateConfirm(m, actionId, { status: res.status, message: res.message }));
      } catch (e) {
        patch(msgId, (m) => updateConfirm(m, actionId, { status: "failed", message: e instanceof Error ? e.message : "Something went wrong" }));
      }
    },
    [patch, session],
  );

  const reset = useCallback(() => {
    sessionRef.current = newSessionId();
    try {
      sessionStorage.setItem("tommy-session", sessionRef.current);
    } catch {
      /* private mode */
    }
    setMessages([]);
  }, []);

  return { messages, busy, send, stop, confirm, reset };
}
