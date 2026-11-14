"use client";
// Temporary page body: shows who owns the page and proves the API call works.
// Owners: replace <Placeholder> with your real page.
import { useEffect, useState } from "react";

import { API_URL } from "@/lib/api";

type Props = {
  title: string;
  owner: string;
  files: string;
  endpoint?: string;
  load?: () => Promise<unknown>;
};

export function Placeholder({ title, owner, files, endpoint, load }: Props) {
  const [state, setState] = useState<{ loading: boolean; data?: unknown; error?: string }>({ loading: !!load });

  useEffect(() => {
    if (!load) return;
    load()
      .then((data) => setState({ loading: false, data }))
      .catch((e: unknown) => setState({ loading: false, error: e instanceof Error ? e.message : String(e) }));
  }, [load]);

  return (
    <section className="space-y-4">
      <h1 className="text-3xl font-bold">{title}</h1>
      <span className="inline-block rounded-full bg-gold px-3 py-1 text-sm font-semibold text-ink">{owner}</span>
      <p className="text-sm text-muted">
        Build this page in <code className="font-mono">{files}</code>
      </p>
      {endpoint && (
        <div className="space-y-2 rounded-lg border border-line bg-surface p-4">
          <p className="font-semibold">{endpoint}</p>
          {state.loading && <p className="text-muted">Loading…</p>}
          {state.error && (
            <p className="text-danger">
              Couldn&apos;t reach the AI service at {API_URL}: {state.error}. Is{" "}
              <code className="font-mono">uvicorn app.main:app --port 8000</code> running?
            </p>
          )}
          {state.data !== undefined && (
            <pre className="max-h-96 overflow-auto font-mono text-xs">{JSON.stringify(state.data, null, 2)}</pre>
          )}
        </div>
      )}
    </section>
  );
}
