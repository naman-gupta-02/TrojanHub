"use client";
// P3 Parnavi: attendance-rewards progress.
import { Placeholder } from "@/components/Placeholder";
import { api } from "@/lib/api";

export default function RewardsPage() {
  return <Placeholder title="Rewards" owner="P3 Parnavi" files="apps/web/app/rewards/" endpoint="GET /api/rewards/progress" load={api.rewards.progress} />;
}
