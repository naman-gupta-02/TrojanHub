"use client";
// P2 Vishwa: the finder edits their post: photo, "What is it?" and "Where did you find it?".
import type { Item } from "@trojanhub/shared";
import { useRef, useState } from "react";

import { type ItemChanges, editItem, shrinkPhoto } from "../_lib/data";
import { ErrorNote, ItemPhoto } from "./parts";

export function EditItem({ item, onSaved, onCancel }: { item: Item; onSaved: (item: Item) => void; onCancel: () => void }) {
  const [description, setDescription] = useState(item.description ?? "");
  const [where, setWhere] = useState(item.location_text ?? "");
  const [newPhoto, setNewPhoto] = useState<{ blob: Blob; preview: string } | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const hasPhoto = !!newPhoto || (!!item.photo_url && !removePhoto);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const blob = await shrinkPhoto(file);
      if (newPhoto) URL.revokeObjectURL(newPhoto.preview);
      setNewPhoto({ blob, preview: URL.createObjectURL(blob) });
      setRemovePhoto(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!where.trim()) return setError("Say where you found it, e.g. Leavey Library, 2nd floor.");
    if (!hasPhoto && !description.trim()) return setError("Add a short description, or keep a photo.");
    const changes: ItemChanges = {};
    if (description.trim() !== (item.description ?? "")) changes.description = description.trim();
    if (where.trim() !== (item.location_text ?? "")) changes.location_text = where.trim();
    if (newPhoto) changes.photo = newPhoto.blob;
    else if (removePhoto) changes.remove_photo = true;
    if (!Object.keys(changes).length) return onCancel();
    setBusy(true);
    setError(null);
    try {
      onSaved(await editItem(item.id, changes));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4 rounded-lg border-2 border-cardinal/40 bg-surface p-4">
      <p className="font-semibold">Edit your post</p>

      <div className="flex flex-wrap items-end gap-3">
        {newPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={newPhoto.preview} alt="New photo" className="h-28 w-28 rounded-md border border-line object-cover" />
        ) : hasPhoto ? (
          <ItemPhoto item={item} className="h-28 w-28 rounded-md border border-line" />
        ) : (
          <div className="flex h-28 w-28 items-center justify-center rounded-md border border-dashed border-line text-sm text-muted">No photo</div>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => fileInput.current?.click()} className="min-h-11 rounded-md border border-line px-3 font-semibold hover:bg-background">
            {hasPhoto ? "Change photo" : "Add photo"}
          </button>
          {hasPhoto && (
            <button
              type="button"
              onClick={() => {
                if (newPhoto) {
                  // drop the newly picked photo (back to the old one, if any)
                  URL.revokeObjectURL(newPhoto.preview);
                  setNewPhoto(null);
                } else {
                  setRemovePhoto(true);
                }
              }}
              className="min-h-11 rounded-md border border-line px-3 font-semibold hover:bg-background"
            >
              {newPhoto && item.photo_url ? "Keep old photo" : "Remove photo"}
            </button>
          )}
          {removePhoto && (
            <button type="button" onClick={() => setRemovePhoto(false)} className="min-h-11 rounded-md border border-line px-3 font-semibold hover:bg-background">
              Undo remove
            </button>
          )}
        </div>
        <input ref={fileInput} type="file" accept="image/*" className="hidden" aria-label="New photo of the item" onChange={(e) => pick(e.target.files?.[0])} />
      </div>

      <label className="block space-y-1">
        <span className="font-semibold">What is it?</span>
        <input value={description} onChange={(e) => setDescription(e.target.value)} aria-label="What is it?" className="min-h-11 w-full rounded-md border border-line bg-surface px-3" />
      </label>
      <label className="block space-y-1">
        <span className="font-semibold">Where did you find it?</span>
        <input value={where} onChange={(e) => setWhere(e.target.value)} aria-label="Where did you find it?" className="min-h-11 w-full rounded-md border border-line bg-surface px-3" />
      </label>

      {error && <ErrorNote message={error} />}
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} className="min-h-11 rounded-md bg-cardinal px-5 font-semibold text-white hover:bg-cardinal-dark disabled:opacity-60">
          {busy ? "Saving…" : "Save changes"}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className="min-h-11 rounded-md border border-line px-4 font-semibold hover:bg-background">
          Cancel
        </button>
      </div>
    </form>
  );
}
