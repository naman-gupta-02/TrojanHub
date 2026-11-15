// React hook for Tommy on mobile: send, stream, confirm, stop.
import { useCallback, useRef, useState } from 'react';

import { api } from '@/lib/api';

import { applyEvent, assistantPlaceholder, chatErrorMessage, newSessionId, updateConfirm, userMessage, type ChatMsg } from './chatState';

export type Photo = { url: string; previewUri: string };

export function useTommy() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const sessionRef = useRef<string>('');
  const abort = useRef<AbortController | null>(null);

  const session = useCallback(() => {
    if (!sessionRef.current) sessionRef.current = newSessionId();
    return sessionRef.current;
  }, []);

  const patch = useCallback((id: string, fn: (m: ChatMsg) => ChatMsg) => {
    setMessages((ms) => ms.map((m) => (m.id === id ? fn(m) : m)));
  }, []);

  const send = useCallback(
    async (text: string, photo?: Photo) => {
      const message = text.trim() || (photo ? "Here's a photo." : '');
      if (!message || busy) return;
      const reply = assistantPlaceholder();
      setMessages((ms) => [...ms, userMessage(message, photo?.previewUri), reply]);
      setBusy(true);
      abort.current = new AbortController();
      try {
        for await (const ev of api.chat.stream({ session_id: session(), message, image_url: photo?.url }, abort.current.signal)) {
          patch(reply.id, (m) => applyEvent(m, ev));
        }
      } catch (e) {
        const aborted = abort.current?.signal.aborted || (e instanceof Error && e.name === 'AbortError');
        patch(reply.id, (m) => ({
          ...m,
          error: aborted ? undefined : chatErrorMessage(e, "I couldn't reach the TrojanHub server. Is the AI service running on the same Wi-Fi?"),
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
      patch(msgId, (m) => updateConfirm(m, actionId, { status: 'sending' }));
      try {
        const res = await api.chat.confirm({ session_id: session(), action_id: actionId, approved, edits });
        patch(msgId, (m) => updateConfirm(m, actionId, { status: res.status, message: res.message }));
      } catch (e) {
        patch(msgId, (m) => updateConfirm(m, actionId, { status: 'failed', message: e instanceof Error ? e.message : 'Something went wrong' }));
      }
    },
    [patch, session],
  );

  const reset = useCallback(() => {
    sessionRef.current = newSessionId();
    setMessages([]);
  }, []);

  return { messages, busy, send, stop, confirm, reset };
}
