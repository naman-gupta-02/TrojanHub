"use client";
// Message box: text, photo button, send / stop.
import { useRef, useState } from "react";

import { preparePhoto } from "../_lib/photo";

type Photo = { url: string; previewUri: string };

type Props = {
  busy: boolean;
  onSend: (text: string, photo?: Photo) => void;
  onStop: () => void;
};

export function Composer({ busy, onSend, onStop }: Props) {
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function submit() {
    if (busy || photoBusy || (!text.trim() && !photo)) return;
    onSend(text, photo ?? undefined);
    setText("");
    setPhoto(null);
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    setPhotoError(null);
    setPhotoBusy(true);
    try {
      setPhoto(await preparePhoto(file));
    } catch {
      setPhotoError("I couldn't read that photo. Try a JPG or PNG.");
    } finally {
      setPhotoBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      {(photo || photoBusy || photoError) && (
        <div className="flex items-center gap-3 text-sm">
          {photo && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
              <img src={photo.previewUri} alt="Attached photo" className="h-14 w-14 rounded-lg object-cover" />
              <button className="text-muted underline" onClick={() => setPhoto(null)}>
                Remove photo
              </button>
            </>
          )}
          {photoBusy && <span className="text-muted">Preparing photo…</span>}
          {photoError && <span className="text-danger">{photoError}</span>}
        </div>
      )}
      <form
        className="flex items-end gap-2 rounded-2xl border border-line bg-surface p-2 focus-within:border-cardinal"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
        <button
          type="button"
          aria-label="Attach a photo"
          title="Attach a photo (found item or flyer)"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-background hover:text-cardinal"
          onClick={() => fileInput.current?.click()}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
        </button>
        <textarea
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Ask Tommy anything…"
          aria-label="Message Tommy"
          className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 outline-none"
        />
        {busy ? (
          <button type="button" onClick={onStop} className="h-11 shrink-0 rounded-xl border border-line px-4 font-medium">
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={photoBusy || (!text.trim() && !photo)}
            className="h-11 shrink-0 rounded-xl bg-cardinal px-4 font-semibold text-white hover:bg-cardinal-dark disabled:opacity-40"
          >
            Send
          </button>
        )}
      </form>
    </div>
  );
}
