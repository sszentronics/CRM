import type { Metadata } from "next";
import { NotificationsScreen } from "@/components/features/notifications/notifications-screen";
import { NoAccess } from "@/components/features/shell/no-access";
import { requireAccess } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { NotificationRow } from "./actions";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  if (!(await requireAccess("/notifications"))) return <NoAccess />;
  const supabase = await createClient();
  // Row-level security returns only the caller's own notifications.
  const { data } = await supabase
    .from("notifications")
    .select("id, type, message, link, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  return <NotificationsScreen initial={(data ?? []) as NotificationRow[]} />;
}
