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
      // Building names first: items at DPS show only their building, so the list needs them
      setBuildings(await getBuildings());
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
      <div className="lf-hero relative overflow-hidden rounded-3xl p-6 text-white shadow-lg sm:p-8">
        <span aria-hidden className="pointer-events-none absolute -right-6 -top-8 select-none text-[9rem] leading-none opacity-10">
          🔎
        </span>
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-gold">Trojans helping Trojans</p>
            <h1 className="text-4xl font-black tracking-tight">Lost &amp; Found</h1>
            <p className="mt-1 max-w-xl text-white/85">Lost something on campus? Search here. Found something? Post it in one step.</p>
          </div>
          <Link
            href="/lost-found/report"
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-gold px-5 font-bold text-ink shadow-md transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            <span aria-hidden>📸</span> I found something
          </Link>
        </div>

        {signedIn !== false && (
          <form onSubmit={searchWords} className="relative mt-6 flex flex-wrap gap-2" role="search">
            <label htmlFor="lf-q" className="sr-only">
              What did you lose?
            </label>
            <input
              id="lf-q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="What did you lose? e.g. black Hydro Flask with a Trojans sticker"
              className="lf-input min-h-12 min-w-0 flex-1 rounded-full border-2 border-transparent bg-white px-5 text-ink shadow-sm"
            />
            <button disabled={busy} className="min-h-12 rounded-full bg-gold px-6 font-bold text-ink shadow-sm transition hover:brightness-105 disabled:opacity-60">
              {busy ? "Searching…" : "Search"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
              className="min-h-12 rounded-full border-2 border-white/60 px-5 font-semibold text-white transition hover:border-white hover:bg-white/10 disabled:opacity-60"
            >
              <span aria-hidden>📷</span> Search by photo
            </button>
            <input ref={fileInput} type="file" accept="image/*" className="hidden" aria-label="Photo of the item you lost" onChange={(e) => searchPhoto(e.target.files?.[0])} />
          </form>
        )}
      </div>

      {signedIn === false ? (
        <SignInNotice what="search and post lost items" />
      ) : (
        <>
          <p className="flex items-start gap-2 rounded-xl border border-gold/50 bg-gold/10 px-4 py-3 text-sm">
            <span aria-hidden>🛡️</span>
            <span>
              Valuables (phones, wallets, IDs, keys, AirPods…) are kept at <b>DPS Lost &amp; Found</b>, which checks who really owns them.
            </span>
          </p>

          {error && <ErrorNote message={error} />}

          {results && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xl font-extrabold">
                  <span className="mr-2 inline-block h-5 w-1.5 translate-y-0.5 rounded-full bg-gold" aria-hidden />
                  {results.label}
                </h2>
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
                <div className="fade-up rounded-2xl border border-dashed border-line bg-surface p-6 text-center text-muted">
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
                <ul key={results.label} className="lf-stagger grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
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
