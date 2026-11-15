"use client";
// P4 Jaymin: admin portal. For every complaint it shows what was reported, which office the AI
// picked and why, and where it was routed. Admins can correct the office and update the status.
import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiRequestError } from "@trojanhub/shared/api";
import type {
  AdminComplaintPatch,
  AdminComplaintRow,
  AdminStatsResponse,
  Department,
  TicketStatus,
  Urgency,
} from "@trojanhub/shared/types";

import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/supabase";

const DEPARTMENTS: Department[] = ["Facilities", "Housing", "ITS", "Transportation", "DPS"];
const URGENCIES: Urgency[] = ["safety", "high", "medium", "low"];
const STATUSES: TicketStatus[] = ["reported", "sent", "resolved"];

const DEPARTMENT_LABEL: Record<Department, string> = {
  Facilities: "Facilities (FPM)",
  Housing: "Housing",
  ITS: "IT Services (ITS)",
  Transportation: "Transportation",
  DPS: "Public Safety (DPS)",
};
const STATUS_LABEL: Record<TicketStatus, string> = { reported: "Reported", sent: "Routed", resolved: "Resolved" };
const LOW_CONFIDENCE = 0.7;

const timeFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const formatTime = (iso: string | null) => (iso ? timeFormat.format(new Date(iso)) : "");
const departmentOf = (row: AdminComplaintRow) => row.corrected_department ?? row.ai_department;

function errorText(e: unknown): string {
  if (e instanceof ApiRequestError && (e.status === 401 || e.status === 403)) {
    return "This page is for department and USG admins. Sign in with an admin account.";
  }
  if (e instanceof ApiRequestError) return e.message;
  return "Couldn't reach the TrojanHub service. Check that it is running, then retry.";
}

export default function AdminPage() {
  const [rows, setRows] = useState<AdminComplaintRow[] | null>(null);
  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
  const [mockMode, setMockMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [department, setDepartment] = useState<Department | "">("");
  const [building, setBuilding] = useState("");
  const [urgency, setUrgency] = useState<Urgency | "">("");

  const load = useCallback(
    () =>
      Promise.all([api.admin.complaints(), api.admin.stats(), api.health()])
        .then(([complaints, summary, health]) => {
          setRows(complaints);
          setStats(summary);
          setMockMode(health.use_mocks);
          setError(null);
        })
        .catch((e: unknown) => setError(errorText(e))),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const buildings = useMemo(
    () => [...new Set((rows ?? []).map((r) => r.building).filter((b): b is string => !!b))].sort(),
    [rows],
  );
  const visible = useMemo(
    () =>
      (rows ?? []).filter(
        (r) =>
          (!department || departmentOf(r) === department) &&
          (!building || r.building === building) &&
          (!urgency || r.urgency === urgency),
      ),
    [rows, department, building, urgency],
  );

  async function save(row: AdminComplaintRow, patch: AdminComplaintPatch) {
    setSavingId(row.id);
    try {
      const updated = await api.admin.patchComplaint(row.id, patch);
      setRows((current) => (current ?? []).map((r) => (r.id === updated.id ? updated : r)));
      // A change applies to every report grouped under the same ticket, so re-read the list.
      // (Mock data isn't saved on the server, so re-reading would undo the change on screen.)
      if (!mockMode) await load();
      setError(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSavingId(null);
    }
  }

  async function exportCsv() {
    try {
      const token = await getAccessToken();
      const res = await fetch(api.admin.ticketsCsvUrl(), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new ApiRequestError(res.status, `http_${res.status}`, "The export failed. Retry in a moment.");
      const link = document.createElement("a");
      link.href = URL.createObjectURL(await res.blob());
      link.download = "trojanhub-complaints.csv";
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Complaint routing</h1>
          <p className="mt-1 text-muted">Every report, the office it was routed to, and why.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} className="min-h-11 rounded-md border border-line bg-surface px-4 text-sm font-semibold hover:bg-background">
            Refresh
          </button>
          <button type="button" onClick={() => void exportCsv()} className="min-h-11 rounded-md bg-cardinal px-4 text-sm font-semibold text-white hover:bg-cardinal-dark">
            Export CSV
          </button>
        </div>
      </header>

      {mockMode && (
        <p className="rounded-md border border-line bg-surface px-4 py-2 text-sm text-muted">
          Showing sample data. Changes you make here are not saved.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-md border border-danger bg-surface px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {stats && <StatTiles stats={stats} />}

      <div className="flex flex-wrap items-end gap-3">
        <Filter label="Department" value={department} onChange={(v) => setDepartment(v as Department | "")}>
          <option value="">All departments</option>
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>{DEPARTMENT_LABEL[d]}</option>
          ))}
        </Filter>
        <Filter label="Building" value={building} onChange={setBuilding}>
          <option value="">All buildings</option>
          {buildings.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </Filter>
        <Filter label="Urgency" value={urgency} onChange={(v) => setUrgency(v as Urgency | "")}>
          <option value="">Any urgency</option>
          {URGENCIES.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </Filter>
        {rows && (
          <p className="ml-auto text-sm text-muted">
            {visible.length} of {rows.length} complaints
          </p>
        )}
      </div>

      {!rows && !error && <p className="text-muted">Loading complaints…</p>}
      {rows && rows.length === 0 && (
        <p className="rounded-lg border border-line bg-surface p-6 text-muted">
          No complaints yet. Reports filed through Tommy or the Report page appear here.
        </p>
      )}
      {rows && rows.length > 0 && visible.length === 0 && (
        <p className="rounded-lg border border-line bg-surface p-6 text-muted">No complaints match these filters.</p>
      )}
      {visible.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[60rem] text-left text-sm">
            <caption className="sr-only">Complaint log</caption>
            <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Logged</th>
                <th scope="col" className="px-4 py-3 font-semibold">Complaint</th>
                <th scope="col" className="px-4 py-3 font-semibold">AI routing</th>
                <th scope="col" className="px-4 py-3 font-semibold">Routed to</th>
                <th scope="col" className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <ComplaintRow key={row.id} row={row} saving={savingId === row.id} onSave={(patch) => void save(row, patch)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function StatTiles({ stats }: { stats: AdminStatsResponse }) {
  const top = Math.max(1, ...stats.by_department.map((d) => d.count));
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Tile label="Complaints logged" value={String(stats.total)} />
      <Tile label="Routed to an office" value={`${stats.forwarded_pct}%`} note="Have a department form or email attached" />
      <Tile label="Routing accuracy" value={`${stats.routing_accuracy_pct}%`} note="AI's department was not corrected by an admin" />
      <div className="rounded-lg border border-line bg-surface p-4">
        <p className="text-sm text-muted">By department</p>
        <ul className="mt-2 space-y-1.5">
          {stats.by_department.map((d) => (
            <li key={d.department} className="text-sm">
              <div className="flex justify-between">
                <span>{DEPARTMENT_LABEL[d.department] ?? d.department}</span>
                <span className="font-semibold tabular-nums">{d.count}</span>
              </div>
              <div className="mt-0.5 h-1.5 rounded-full bg-background" aria-hidden="true">
                <div className="h-1.5 rounded-full bg-cardinal" style={{ width: `${(100 * d.count) / top}%` }} />
              </div>
            </li>
          ))}
          {stats.by_department.length === 0 && <li className="text-sm text-muted">Nothing yet</li>}
        </ul>
      </div>
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
}

function Filter(props: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block font-semibold">{props.label}</span>
      <select value={props.value} onChange={(e) => props.onChange(e.target.value)} className="min-h-11 rounded-md border border-line bg-surface px-3">
        {props.children}
      </select>
    </label>
  );
}

const URGENCY_STYLE: Record<Urgency, string> = {
  safety: "bg-danger text-white",
  high: "border border-danger text-danger",
  medium: "border border-warning text-warning",
  low: "border border-line text-muted",
};

function ComplaintRow({ row, saving, onSave }: { row: AdminComplaintRow; saving: boolean; onSave: (patch: AdminComplaintPatch) => void }) {
  const current = departmentOf(row);
  const location = [row.building, row.room].filter(Boolean).join(" ") || "No location given";
  const lowConfidence = row.ai_confidence !== null && row.ai_confidence < LOW_CONFIDENCE && !row.corrected_department;

  return (
    <tr className="border-b border-line align-top last:border-0">
      <td className="whitespace-nowrap px-4 py-4">
        <p>{formatTime(row.logged_at)}</p>
        <p className="mt-1 text-xs text-muted">via {row.source === "chat" ? "Tommy chat" : "report form"}</p>
      </td>

      <td className="max-w-xs px-4 py-4">
        <p>&ldquo;{row.text}&rdquo;</p>
        {row.photo_url && (
          // Signed link to a private photo, valid about an hour (reload the page for a fresh one).
          <a href={row.photo_url} target="_blank" rel="noreferrer" className="mt-2 inline-block" title="Open the student's photo">
            {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not optimizable */}
            <img src={row.photo_url} alt="Photo attached to this report" className="h-20 w-28 rounded-md border border-line object-cover" />
          </a>
        )}
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold">{location}</span>
          <span className={`rounded-full px-2 py-0.5 ${URGENCY_STYLE[row.urgency]}`}>{row.urgency}</span>
          {row.report_count > 1 && <span className="rounded-full bg-gold px-2 py-0.5 font-semibold text-ink">{row.report_count} reports</span>}
        </p>
      </td>

      <td className="max-w-xs px-4 py-4">
        <p className="font-semibold">{row.ai_department ? DEPARTMENT_LABEL[row.ai_department] : "Not sorted"}</p>
        {row.ai_confidence !== null && (
          <p className={`mt-1 text-xs ${lowConfidence ? "font-semibold text-warning" : "text-muted"}`}>
            {Math.round(row.ai_confidence * 100)}% confident{lowConfidence ? " · worth a check" : ""}
          </p>
        )}
        {row.ai_reason && <p className="mt-1 text-xs text-muted">{row.ai_reason}</p>}
        {row.corrected_department && (
          <p className="mt-2 text-xs font-semibold text-cardinal">Corrected to {DEPARTMENT_LABEL[row.corrected_department]}</p>
        )}
      </td>

      <td className="px-4 py-4">
        {row.forwarded_to ? (
          <>
            <p className="font-semibold text-success">✓ {row.forwarded_to}</p>
            <p className="mt-1 text-xs text-muted">{formatTime(row.forwarded_at)}</p>
          </>
        ) : (
          <p className="text-muted">Not routed yet</p>
        )}
        <label className="mt-3 block text-xs">
          <span className="mb-1 block text-muted">Department</span>
          <select
            value={current ?? ""}
            disabled={saving}
            onChange={(e) => onSave({ corrected_department: e.target.value as Department })}
            className="min-h-11 rounded-md border border-line bg-surface px-2 disabled:opacity-60"
          >
            {!current && <option value="">Choose department</option>}
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {d === current ? DEPARTMENT_LABEL[d] : `Move to ${DEPARTMENT_LABEL[d]}`}
              </option>
            ))}
          </select>
        </label>
      </td>

      <td className="px-4 py-4">
        <label>
          <span className="sr-only">Status of this complaint</span>
          <select
            value={row.status}
            disabled={saving}
            onChange={(e) => onSave({ status: e.target.value as TicketStatus })}
            className="min-h-11 rounded-md border border-line bg-surface px-2 disabled:opacity-60"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </label>
        {saving && <p className="mt-1 text-xs text-muted">Saving…</p>}
      </td>
    </tr>
  );
}
