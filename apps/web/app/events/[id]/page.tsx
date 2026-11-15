// P3 Parnavi: event detail. Suspense because the event id comes from the URL (cacheComponents).
import { Suspense } from "react";

import { DetailSkeleton, EventDetail } from "@/components/events/EventDetail";

export default function EventPage() {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <EventDetail />
    </Suspense>
  );
}
