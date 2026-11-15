// P3 Parnavi: edit a posted event (same form as the flyer scanner). Suspense because the id comes from the URL.
import { Suspense } from "react";

import { EditEvent } from "@/components/events/FlyerScanner";

export default function EditEventPage() {
  return (
    <Suspense fallback={<p className="text-muted">Loading your event…</p>}>
      <EditEvent />
    </Suspense>
  );
}
