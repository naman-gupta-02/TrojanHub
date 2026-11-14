"use client";
// P4 Jaymin: admin dashboard (complaint log, AI department + confidence + reason, forwarded, Correct, accuracy tile).
import { Placeholder } from "@/components/Placeholder";
import { api } from "@/lib/api";

export default function AdminPage() {
  return <Placeholder title="Admin dashboard" owner="P4 Jaymin" files="apps/web/app/admin/" endpoint="GET /api/admin/stats" load={api.admin.stats} />;
}
