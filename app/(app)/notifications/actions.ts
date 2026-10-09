"use server";

import { refresh } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type NotificationRow = {
  id: string;
  type: string;
  message: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

async function signedIn() {
  const ctx = await getSessionContext();
  return !!ctx?.profile?.is_active;
}

/** The newest notifications for the bell. Row-level security returns only the caller's own. */
export async function latestNotifications(limit = 8): Promise<{ items: NotificationRow[]; unread: number }> {
  if (!(await signedIn())) return { items: [], unread: 0 };
  const supabase = await createClient();
  const [{ data }, { count }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, type, message, link, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 50)),
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
  ]);
  return { items: (data ?? []) as NotificationRow[], unread: count ?? 0 };
}

export async function markRead(id: string): Promise<void> {
  if (!(await signedIn()) || !/^[0-9a-f-]{36}$/i.test(id)) return;
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).is("read_at", null);
}

export async function markAllRead(): Promise<void> {
  if (!(await signedIn())) return;
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  refresh();
}
