// P2 Vishwa: one handoff chat. The thread id is only known at request time, so the client part
// that reads it sits inside <Suspense> (required with cacheComponents).
import { Suspense } from "react";

import { Thread } from "../../_components/Thread";

export default function ThreadPage() {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Thread />
    </Suspense>
  );
}
