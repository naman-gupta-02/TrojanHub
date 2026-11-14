// P4 Jaymin: Report a problem (complaint form -> AI draft -> confirm) + My complaints.
import { useCallback } from 'react';

import { Placeholder } from '@/components/Placeholder';
import { api } from '@/lib/api';

export default function ReportScreen() {
  const load = useCallback(() => api.complaints.draft({ text: "it's so hot in GFS 213" }), []);
  return <Placeholder title="Report a problem" owner="P4 Jaymin" files="apps/mobile/app/(tabs)/report.tsx" endpoint="POST /api/complaints (draft)" load={load} />;
}
