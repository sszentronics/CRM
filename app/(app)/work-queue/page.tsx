import type { Metadata } from "next";
import { WorkQueue, type WorkQueueData } from "@/components/features/dashboards/work-queue";
import { NoAccess } from "@/components/features/shell/no-access";
import { requireAccess } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Work queue" };

export default async function WorkQueuePage() {
  const ctx = await requireAccess("/work-queue");
  if (!ctx) return <NoAccess />;
  const supabase = await createClient();
  const { data } = await supabase.rpc("work_queue");
  return <WorkQueue data={data as WorkQueueData} firstName={ctx.profile.full_name.split(" ")[0]} />;
}
