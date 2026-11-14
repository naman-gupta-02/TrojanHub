"use client";
// P2 Vishwa: Lost & Found (report found, search by words/photo, item detail, claim, messages).
import { Placeholder } from "@/components/Placeholder";
import { api } from "@/lib/api";

const load = () => api.items.search({ q: "black hydro flask" });

export default function LostFoundPage() {
  return <Placeholder title="Lost & Found" owner="P2 Vishwa" files="apps/web/app/lost-found/" endpoint="GET /api/items/search?q=black hydro flask" load={load} />;
}
