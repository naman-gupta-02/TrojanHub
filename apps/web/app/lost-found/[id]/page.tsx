// P2 Vishwa: item detail. The id is only known at request time, so the client part that reads it
// sits inside <Suspense> (required with cacheComponents; see next/dist/docs useParams).
import { Suspense } from "react";

import { ItemDetail } from "../_components/ItemDetail";

export default function ItemPage() {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <ItemDetail />
    </Suspense>
  );
}
