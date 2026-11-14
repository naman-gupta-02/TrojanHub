"use client";
// One chat bubble: text with [n] citations, tool status lines, source chips and confirm cards.
import { parseAnswer, toolLabel, type ChatMsg } from "../_lib/chatState";
import { ConfirmCardView } from "./ConfirmCard";

type Props = {
  msg: ChatMsg;
  onConfirm: (actionId: string, approved: boolean, edits?: Record<string, unknown>) => void;
};

export function Message({ msg, onConfirm }: Props) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] space-y-2 rounded-2xl rounded-br-md bg-cardinal px-4 py-2.5 text-white">
          {msg.imageUri && (
            // eslint-disable-next-line @next/next/no-img-element -- local blob preview
            <img src={msg.imageUri} alt="Photo you attached" className="max-h-56 rounded-lg" />
          )}
          <p className="whitespace-pre-wrap">{msg.text}</p>
        </div>
      </div>
    );
  }

  const sourceUrl = (n: number) => msg.sources.find((s) => s.n === n)?.url;
  const waiting = msg.streaming && !msg.text && msg.tools.every((t) => t.done);

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] space-y-2">
        {msg.tools.length > 0 && (
          <ul className="space-y-0.5 text-xs text-muted" aria-live="polite">
            {msg.tools.map((t) => (
              <li key={t.id} className="flex items-center gap-1.5">
                <span aria-hidden className={t.done ? "text-success" : "animate-pulse text-cardinal"}>
                  {t.done ? "✓" : "●"}
                </span>
                {toolLabel(t)}
              </li>
            ))}
          </ul>
        )}

        {(msg.text || waiting) && (
          <div className="rounded-2xl rounded-bl-md border border-line bg-surface px-4 py-2.5">
            {waiting ? (
              <span className="inline-flex gap-1 py-1" aria-label="Tommy is thinking">
                <Dot delay="0ms" /> <Dot delay="150ms" /> <Dot delay="300ms" />
              </span>
            ) : (
              <p className="whitespace-pre-wrap leading-relaxed">
                {parseAnswer(msg.text).map((p, i) => {
                  if (p.kind === "text") return <span key={i}>{p.text}</span>;
                  if (p.kind === "bold") return <strong key={i}>{p.text}</strong>;
                  if (p.kind === "link")
                    return (
                      <a key={i} href={p.url} target="_blank" rel="noreferrer" className="break-all text-cardinal underline">
                        {p.text}
                      </a>
                    );
                  const url = sourceUrl(p.n);
                  const chip = (
                    <sup className="mx-0.5 rounded bg-gold px-1 text-[0.65rem] font-semibold text-ink">{p.n}</sup>
                  );
                  return url ? (
                    <a key={i} href={url} target="_blank" rel="noreferrer" aria-label={`Source ${p.n}`}>
                      {chip}
                    </a>
                  ) : (
                    <span key={i}>{chip}</span>
                  );
                })}
                {msg.streaming && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-cardinal align-middle" aria-hidden />}
              </p>
            )}
          </div>
        )}

        {msg.error && <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{msg.error}</p>}

        {msg.sources.length > 0 && (
          <div className="flex flex-wrap gap-2" aria-label="Sources">
            {msg.sources.map((s) => (
              <a
                key={s.n}
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs hover:border-cardinal"
                title={s.url}
              >
                <span className="rounded bg-gold px-1 font-semibold text-ink">{s.n}</span>
                <span className="truncate">{s.title}</span>
              </a>
            ))}
          </div>
        )}

        {msg.confirms.map((c) => (
          <ConfirmCardView key={c.action_id} card={c} onAnswer={(approved, edits) => onConfirm(c.action_id, approved, edits)} />
        ))}
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-muted" style={{ animationDelay: delay }} />;
}
