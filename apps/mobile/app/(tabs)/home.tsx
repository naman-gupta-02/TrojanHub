// P3 Parnavi: personalized feed ("3 things for you today" + today's freebies).
import { Placeholder } from '@/components/Placeholder';
import { api } from '@/lib/api';

export default function HomeScreen() {
  return <Placeholder title="For you today" owner="P3 Parnavi" files="apps/mobile/app/(tabs)/home.tsx" endpoint="GET /api/feed" load={api.feed} />;
}
