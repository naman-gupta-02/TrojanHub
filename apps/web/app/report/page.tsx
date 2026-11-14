"use client";
// P4 Jaymin: report a problem (text -> AI draft -> confirm) + my complaints.
import { Placeholder } from "@/components/Placeholder";
import { api } from "@/lib/api";

const load = () => api.complaints.draft({ text: "it's so hot in GFS 213" });

export default function ReportPage() {
  return <Placeholder title="Report a problem" owner="P4 Jaymin" files="apps/web/app/report/" endpoint="POST /api/complaints (draft)" load={load} />;
}
