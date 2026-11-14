// P2 Vishwa: Lost & Found home (search + "I found something").
import { useCallback } from 'react';

import { Placeholder } from '@/components/Placeholder';
import { api } from '@/lib/api';

export default function LostFoundScreen() {
  const load = useCallback(() => api.items.search({ q: 'black hydro flask' }), []);
  return <Placeholder title="Lost & Found" owner="P2 Vishwa" files="apps/mobile/app/(tabs)/lost-found/" endpoint="GET /api/items/search?q=black hydro flask" load={load} />;
}
