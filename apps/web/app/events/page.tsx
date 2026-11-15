// P3 Parnavi: events calendar + filters. Suspense because the filters read the URL (cacheComponents).
import { Suspense } from "react";

import { EventsBrowser } from "@/components/events/EventsBrowser";
import { CardSkeleton } from "@/components/events/kit";

export default function EventsPage() {
  return (
    <Suspense fallback={<CardSkeleton count={4} />}>
      <EventsBrowser />
    </Suspense>
  );
}
