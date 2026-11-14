"use client";
// P3 Parnavi: events calendar + filters, event detail (Add to calendar, Register), flyer scan.
import { Placeholder } from "@/components/Placeholder";
import { api } from "@/lib/api";

const load = () => api.events.search();

export default function EventsPage() {
  return <Placeholder title="Events" owner="P3 Parnavi" files="apps/web/app/events/" endpoint="GET /api/events/search" load={load} />;
}
