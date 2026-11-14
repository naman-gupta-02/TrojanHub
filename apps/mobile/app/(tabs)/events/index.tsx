// P3 Parnavi: Events + Deals + Rewards.
import { useCallback } from 'react';

import { Placeholder } from '@/components/Placeholder';
import { api } from '@/lib/api';

export default function EventsScreen() {
  const load = useCallback(() => api.events.search({ freebie: true }), []);
  return <Placeholder title="Events & Deals" owner="P3 Parnavi" files="apps/mobile/app/(tabs)/events/" endpoint="GET /api/events/search?freebie=true" load={load} />;
}
