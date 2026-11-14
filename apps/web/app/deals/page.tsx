"use client";
// P3 Parnavi: ongoing deals + one-time freebies.
import { Placeholder } from "@/components/Placeholder";
import { api } from "@/lib/api";

const load = () => api.deals.search({ active: true });

export default function DealsPage() {
  return <Placeholder title="Deals & Freebies" owner="P3 Parnavi" files="apps/web/app/deals/" endpoint="GET /api/deals/search?active=true" load={load} />;
}
