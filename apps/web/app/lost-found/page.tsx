"use client";
// P2 Vishwa: Lost & Found home. Browse recently found items, search by words or by photo.
import type { Building, Item } from "@trojanhub/shared";
import { ApiRequestError } from "@trojanhub/shared/api";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";

import { ErrorNote, ItemCard, SignInNotice } from "./_components/parts";
import { currentUserId, getBuildings, isMock, listRecent, shrinkPhoto } from "./_lib/data";

type Results = { label: string; items: { item: Item; score?: number }[] };

export default function LostFoundPage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(isMock ? true : null);
  const [buildings, setBuildings] = useState<Record<string, Building>>({});
  const [results, setResults] = useState<Results | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function showRecent() {
    setError(null);
    try {
      const items = await listRecent();
      setResults({ label: "Recently found", items: items.map((item) => ({ item })) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    (async () => {
      if (!isMock) {
        const uid = await currentUserId();
        setSignedIn(!!uid);
        if (!uid) return;
      }
      getBuildings().then(setBuildings);
      showRecent();
    })();
  }, []);

  async function run(label: string, call: () => Promise<{ results: { item: Item; score: number }[] }>) {
    setBusy(true);
    setError(null);
    try {
      const { results } = await call();
      setResults({ label, items: results.slice(0, 10) });
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "Search isn't working right now. Is the AI service running?");
    } finally {
      setBusy(false);
    }
  }

  function searchWords(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return showRecent();
    run(`Matches for “${q}”`, () => api.items.search({ q }));
  }

  async function searchPhoto(file: File | undefined) {
    if (!file) return;
    try {
      const photo = await shrinkPhoto(file);
      await run("Matches for your photo", () => api.items.searchByImage(photo));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Lost &amp; Found</h1>
          <p className="text-muted">Lost something on campus? Search here. Found something? Post it in one step.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/lost-found/report" className="inline-flex min-h-11 items-center rounded-md bg-cardinal px-4 font-semibold text-white hover:bg-cardinal-dark">
            I found something
          </Link>
        </div>
      </div>

      {signedIn === false ? (
        <SignInNotice what="search and post lost items" />
      ) : (
        <>
          <form onSubmit={searchWords} className="flex flex-wrap gap-2" role="search">
            <label htmlFor="lf-q" className="sr-only">
              What did you lose?
            </label>
            <input
              id="lf-q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="What did you lose? e.g. black Hydro Flask with a Trojans sticker"
              className="min-h-11 min-w-0 flex-1 rounded-md border border-line bg-surface px-3"
            />
            <button disabled={busy} className="min-h-11 rounded-md bg-cardinal px-5 font-semibold text-white hover:bg-cardinal-dark disabled:opacity-60">
              {busy ? "Searching…" : "Search"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
              className="min-h-11 rounded-md border border-line bg-surface px-4 font-semibold hover:bg-background disabled:opacity-60"
            >
              Search by photo
            </button>
            <input ref={fileInput} type="file" accept="image/*" className="hidden" aria-label="Photo of the item you lost" onChange={(e) => searchPhoto(e.target.files?.[0])} />
          </form>

          <p className="text-sm text-muted">
            Valuables (phones, wallets, IDs, keys, AirPods…) are kept at DPS Lost &amp; Found, which checks who really owns them.
          </p>

          {error && <ErrorNote message={error} />}

          {results && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xl font-semibold">{results.label}</h2>
                {results.label !== "Recently found" && (
                  <button
                    onClick={() => {
                      setQuery("");
                      showRecent();
                    }}
                    className="min-h-11 text-sm font-semibold text-cardinal hover:underline"
                  >
                    Show all recent
                  </button>
                )}
              </div>
              {results.items.length === 0 ? (
                <div className="rounded-lg border border-line bg-surface p-4 text-muted">
                  {results.label === "Recently found" ? (
                    "Nothing has been posted yet."
                  ) : (
                    <>
                      No matches yet. New items get posted all the time, so check back later. You can also ask{" "}
                      <a href="https://dps.usc.edu/services/lost-and-found/" target="_blank" rel="noreferrer" className="font-semibold text-cardinal underline">
                        DPS Lost &amp; Found
                      </a>
                      .
                    </>
                  )}
                </div>
              ) : (
                <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {results.items.map(({ item, score }) => (
                    <li key={item.id} className="flex">
                      <ItemCard item={item} buildings={buildings} score={score} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
