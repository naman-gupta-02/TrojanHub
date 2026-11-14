"use client";
// P3 Parnavi: home feed ("3 things for you today" + today's freebies).
import { Placeholder } from "@/components/Placeholder";
import { api } from "@/lib/api";

export default function HomePage() {
  return <Placeholder title="For you today" owner="P3 Parnavi" files="apps/web/app/page.tsx" endpoint="GET /api/feed" load={api.feed} />;
}
