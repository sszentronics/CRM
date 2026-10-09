"use client";

import { Bell as BellIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  latestNotifications,
  markAllRead,
  markRead,
  type NotificationRow,
} from "@/app/(app)/notifications/actions";
import { timeAgo } from "@/lib/format/dates";
import { useToast } from "@/components/ui/toast";
import { authorizeRealtime, createBrowserSupabase } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

/** Short title per notification type. Unknown types fall back to "Update". */
export const NOTIFICATION_TITLE: Record<string, string> = {
  lead_assigned: "Lead assigned",
  leads_to_assign: "Leads to assign",
  leads_returned: "Leads returned",
  lead_returned: "Lead returned",
  invalid_to_confirm: "Invalid mark to confirm",
  invalid_rejected: "Invalid mark rejected",
  lead_note: "Note from your Team Lead",
  follow_up_due_soon: "Follow-up due soon",
  follow_up_overdue: "Follow-up overdue",
  referral_new: "New referral",
  referral_accepted: "Referral accepted",
  referral_cancelled: "Referral cancelled",
  referral_overdue: "Referral without a date",
  session_booked: "Session booked",
  session_attended: "Session done",
  session_no_show: "Session no-show",
  document_rejected: "Document rejected",
  deposit_to_verify: "Deposit to verify",
  deposit_verified: "Deposit verified",
  deposit_rejected: "Deposit rejected",
  deposit_reversed: "Deposit reversed",
  deposit_question: "Question about a deposit",
};

/** The bell: unread count, live over Realtime, and the newest notifications in a panel. */
export function Bell({ userId, initialUnread }: { userId: string; initialUnread: number }) {
  const router = useRouter();
  const toast = useToast();
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<NotificationRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const r = await latestNotifications();
    setItems(r.items);
    setUnread(r.unread);
  }, []);

  // New notifications arrive over Realtime; row-level security limits them to this user.
  useEffect(() => {
    const supabase = createBrowserSupabase();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let stopped = false;
    void authorizeRealtime(supabase).then(() => {
      if (stopped) return;
      channel = supabase
        .channel(`notifications:${userId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
          (payload) => {
            setUnread((n) => n + 1);
            setItems(null);
            // A verified deposit is the one win the app celebrates with a toast.
            const row = payload.new as { type?: string; message?: string };
            if (row.type === "deposit_verified" && row.message) toast(row.message, "success");
          },
        )
        .subscribe();
    });
    return () => {
      stopped = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [userId, toast]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) start(load);
  }

  function openItem(n: NotificationRow) {
    setOpen(false);
    start(async () => {
      if (!n.read_at) {
        await markRead(n.id);
        setUnread((u) => Math.max(0, u - 1));
      }
      if (n.link) router.push(n.link);
    });
  }

  const label = unread > 0 ? `Notifications, ${unread} unread` : "Notifications";

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
        className="relative inline-flex size-10 items-center justify-center rounded-control text-tl-text-2 hover:bg-tl-raised hover:text-tl-text"
      >
        <BellIcon aria-hidden className="size-5" />
        {unread > 0 ? (
          <span
            aria-hidden
            data-testid="unread-count"
            className="tl-amount absolute top-1 right-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-tl-primary px-1 text-[11px] font-semibold text-white"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute top-12 right-0 z-40 w-[380px] overflow-hidden rounded-card border border-tl-line bg-tl-surface shadow-pop"
        >
          <div className="flex items-center justify-between border-b border-tl-line px-4 py-3">
            <p className="text-title font-semibold text-tl-text">Notifications</p>
            {unread > 0 ? (
              <button
                type="button"
                onClick={() =>
                  start(async () => {
                    await markAllRead();
                    setUnread(0);
                    await load();
                  })
                }
                className="text-label font-semibold text-tl-link hover:underline"
              >
                Mark all as read
              </button>
            ) : null}
          </div>
          {items === null ? (
            <div aria-busy className="flex flex-col gap-2 p-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 rounded-control bg-tl-raised" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="px-4 py-8 text-center text-body text-tl-muted">No notifications yet.</p>
          ) : (
            <ul className="max-h-[420px] overflow-y-auto">
              {items.map((n) => (
                <li key={n.id} className="border-b border-tl-line last:border-b-0">
                  <button
                    type="button"
                    onClick={() => openItem(n)}
                    className={cn("flex w-full gap-3 px-4 py-3 text-left hover:bg-tl-bg", !n.read_at && "bg-tl-primary-soft/40")}
                  >
                    <span
                      aria-hidden
                      className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-tl-primary")}
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-label font-semibold text-tl-text">
                          {NOTIFICATION_TITLE[n.type] ?? "Update"}
                          {!n.read_at ? <span className="sr-only"> (unread)</span> : null}
                        </span>
                        <span className="shrink-0 text-small text-tl-muted">{timeAgo(n.created_at)}</span>
                      </span>
                      <span className="text-body text-tl-text-2">{n.message}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-tl-line px-4 py-2.5 text-center">
            <Link href="/notifications" onClick={() => setOpen(false)} className="text-label font-semibold text-tl-link hover:underline">
              See all notifications
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
