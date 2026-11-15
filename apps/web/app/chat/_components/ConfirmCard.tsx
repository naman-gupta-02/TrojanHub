"use client";
// Confirm card for actions that write data: Edit / Confirm / Cancel (ARCHITECTURE.md §7.1).
import { useState } from "react";

import { editableFields, type ConfirmCard } from "../_lib/chatState";

type Props = {
  card: ConfirmCard;
  onAnswer: (approved: boolean, edits?: Record<string, unknown>) => void;
};

export function ConfirmCardView({ card, onAnswer }: Props) {
  const fields = editableFields(card);
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<string, unknown>>({});
  const value = (key: string) => (key in edits ? edits[key] : card.draft[key]);
  const changed = Object.keys(edits).length > 0;

  if (card.status === "done" || card.status === "cancelled" || card.status === "failed") {
    const tone =
      card.status === "done" ? "border-success/40 bg-success/5 text-success" : card.status === "failed" ? "border-danger/40 bg-danger/5 text-danger" : "border-line bg-surface text-muted";
    return (
      <div className={`rounded-xl border px-4 py-3 text-sm ${tone}`} role="status">
        <p className="font-semibold">
          {card.status === "done" ? "✓ " : card.status === "failed" ? "✗ " : ""}
          {card.title}
        </p>
        <p className="mt-0.5 text-ink">{card.message}</p>
      </div>
    );
  }

  const sending = card.status === "sending";
  return (
    <div className="rounded-xl border-2 border-gold bg-surface p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Please confirm</p>
      <p className="mt-1 font-semibold">{card.title}</p>
      <p className="mt-0.5 text-sm text-muted">{card.summary}</p>

      {editing && (
        <div className="mt-3 space-y-2">
          {fields.map((f) =>
            f.kind === "bool" ? (
              <label key={f.key} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-cardinal"
                  checked={Boolean(value(f.key))}
                  onChange={(e) => setEdits({ ...edits, [f.key]: e.target.checked })}
                />
                {f.label}
              </label>
            ) : (
              <label key={f.key} className="block text-sm">
                <span className="text-muted">{f.label}</span>
                <input
                  className="mt-0.5 min-h-11 w-full rounded-md border border-line px-3"
                  value={String(value(f.key) ?? "")}
                  onChange={(e) => setEdits({ ...edits, [f.key]: e.target.value })}
                />
              </label>
            ),
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="min-h-11 rounded-md bg-cardinal px-4 font-semibold text-white hover:bg-cardinal-dark disabled:opacity-60"
          disabled={sending}
          onClick={() => onAnswer(true, changed ? edits : undefined)}
        >
          {sending ? "Sending…" : "Confirm"}
        </button>
        {fields.length > 0 && (
          <button className="min-h-11 rounded-md border border-line px-4 font-medium disabled:opacity-60" disabled={sending} onClick={() => setEditing(!editing)}>
            {editing ? "Done editing" : "Edit"}
          </button>
        )}
        <button className="min-h-11 rounded-md px-4 font-medium text-muted hover:text-ink disabled:opacity-60" disabled={sending} onClick={() => onAnswer(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
