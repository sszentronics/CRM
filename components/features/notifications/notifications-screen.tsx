"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { markAllRead, markRead, type NotificationRow } from "@/app/(app)/notifications/actions";
import { PageHeader } from "@/components/features/shell/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs } from "@/components/ui/tabs";
import { timeAgo } from "@/lib/format/dates";
import { cn } from "@/lib/utils";
import { NOTIFICATION_TITLE } from "./bell";

type Filter = "all" | "unread";

/** Every notification, newest first. Tapping one marks it read and opens the lead or deposit it is about. */
export function NotificationsScreen({ initial }: { initial: NotificationRow[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<Filter>("all");
  const [, start] = useTransition();
  const unread = items.filter((n) => !n.read_at).length;
  const shown = filter === "unread" ? items.filter((n) => !n.read_at) : items;

  function open(n: NotificationRow) {
    start(async () => {
      if (!n.read_at) {
        setItems((all) => all.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
        await markRead(n.id);
      }
      if (n.link) router.push(n.link);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notifications"
        description="Things that need you, newest first."
        actions={
          <Button
            variant="secondary"
            disabled={unread === 0}
            onClick={() =>
              start(async () => {
                setItems((all) => all.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })));
                await markAllRead();
              })
            }
          >
            Mark all as read
          </Button>
        }
      />
      <Tabs
        idPrefix="notifications"
        label="Show"
        value={filter}
        onChange={setFilter}
        items={[
          { value: "all", label: "All", count: items.length },
          { value: "unread", label: "Unread", count: unread },
        ]}
      />
      {shown.length === 0 ? (
        <EmptyState
          title={filter === "unread" ? "You are all caught up." : "No notifications yet."}
          body={filter === "unread" ? "Unread notifications appear here." : "When something needs you, it shows up here and in the bell."}
        />
      ) : (
        <ul aria-label="Notifications" className="overflow-hidden rounded-card border border-tl-line bg-tl-surface shadow-card">
          {shown.map((n) => (
            <li key={n.id} className="border-b border-tl-line last:border-b-0">
              <button
                type="button"
                onClick={() => open(n)}
                className={cn("flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-tl-bg", !n.read_at && "bg-tl-primary-soft/40")}
              >
                <span aria-hidden className={cn("mt-2 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-tl-primary")} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center justify-between gap-3">
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
    </div>
  );
}
