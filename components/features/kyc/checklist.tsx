"use client";

import { Check, CircleAlert, CircleDashed, Clock, Lock } from "lucide-react";
import { useState } from "react";
import { approveAll, reviewDocument, setCollected, unlockDocument } from "@/app/(app)/lead/[id]/kyc-actions";
import { Button } from "@/components/ui/button";
import { documentLabel } from "@/lib/brokers/documents";
import { formatKarachi } from "@/lib/format/dates";
import { useToastAction } from "@/lib/hooks/use-toast-action";
import { cn } from "@/lib/utils";

export type DocumentRow = {
  id: string;
  type: string;
  status: "collected" | "approved" | "rejected";
  collected_at: string;
  reviewed_at: string | null;
  reject_reason: string | null;
};

function StatusLine({ doc }: { doc: DocumentRow | undefined }) {
  if (!doc) {
    return (
      <span className="inline-flex items-center gap-1.5 text-small text-tl-muted">
        <CircleDashed aria-hidden className="size-3.5" />
        Not collected
      </span>
    );
  }
  if (doc.status === "approved") {
    return (
      <span className="inline-flex items-center gap-1.5 text-small font-semibold text-tl-text">
        <Lock aria-hidden className="size-3.5 text-tl-primary" />
        Approved
      </span>
    );
  }
  if (doc.status === "rejected") {
    return (
      <span className="inline-flex items-center gap-1.5 text-small font-semibold text-tl-danger">
        <CircleAlert aria-hidden className="size-3.5" />
        Rejected: {doc.reject_reason}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-small font-semibold text-tl-wait">
      <Clock aria-hidden className="size-3.5" />
      Collected {formatKarachi(doc.collected_at, "date")}, waiting for review
    </span>
  );
}

function Toggle({ profileId, type, collected, label }: { profileId: string; type: string; collected: boolean; label: string }) {
  const [, action, pending] = useToastAction(setCollected);
  return (
    <form action={action}>
      <input type="hidden" name="profileId" value={profileId} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="collected" value={String(!collected)} />
      <Button type="submit" size="sm" variant={collected ? "ghost" : "secondary"} disabled={pending} aria-label={`${collected ? "Clear" : "Mark collected"}: ${label}`}>
        {collected ? "Clear tick" : (
          <>
            <Check aria-hidden className="size-4" />
            Mark collected
          </>
        )}
      </Button>
    </form>
  );
}

function Review({ doc, label }: { doc: DocumentRow; label: string }) {
  const [state, action, pending] = useToastAction(reviewDocument);
  const [rejecting, setRejecting] = useState(false);
  const [, unlock, unlocking] = useToastAction(unlockDocument);
  if (doc.status === "approved") {
    return (
      <form action={unlock}>
        <input type="hidden" name="documentId" value={doc.id} />
        <Button type="submit" size="sm" variant="ghost" disabled={unlocking} aria-label={`Unlock ${label}`}>
          Unlock
        </Button>
      </form>
    );
  }
  if (rejecting) {
    return (
      <form action={action} className="flex flex-wrap items-start gap-2">
        <input type="hidden" name="documentId" value={doc.id} />
        <input type="hidden" name="decision" value="reject" />
        <span className="flex flex-col gap-1">
          <input
            name="reason"
            autoFocus
            maxLength={200}
            placeholder="For example: blurry, expired, name does not match"
            aria-label={`Reason for rejecting ${label}`}
            aria-invalid={state?.fieldErrors?.reason ? true : undefined}
            className="h-8 w-72 rounded-control border border-tl-line-strong bg-tl-surface px-2.5 text-label text-tl-text aria-invalid:border-tl-danger"
          />
          {state?.fieldErrors?.reason ? <span className="text-small text-tl-danger">{state.fieldErrors.reason[0]}</span> : null}
        </span>
        <Button type="submit" size="sm" variant="danger" disabled={pending}>
          Reject
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
          Cancel
        </Button>
      </form>
    );
  }
  return (
    <span className="inline-flex gap-1">
      {doc.status === "collected" ? (
        <form action={action}>
          <input type="hidden" name="documentId" value={doc.id} />
          <input type="hidden" name="decision" value="approve" />
          <Button type="submit" size="sm" disabled={pending} aria-label={`Approve ${label}`}>
            Approve
          </Button>
        </form>
      ) : null}
      <Button size="sm" variant="ghost" onClick={() => setRejecting(true)} aria-label={`Reject ${label}`}>
        Reject
      </Button>
    </span>
  );
}

/** The broker's checklist with each item's status. Agents tick; Admins review. */
export function Checklist({
  profileId,
  checklist,
  documents,
  canEdit,
  isAdmin,
}: {
  profileId: string;
  checklist: string[];
  documents: DocumentRow[];
  canEdit: boolean;
  isAdmin: boolean;
}) {
  const byType = new Map(documents.map((d) => [d.type, d]));
  const waiting = documents.filter((d) => d.status === "collected" && checklist.includes(d.type)).length;
  const [, approveAllAction, approving] = useToastAction(approveAll);

  return (
    <div className="flex flex-col gap-2">
      {isAdmin && waiting > 0 ? (
        <form action={approveAllAction} className="flex justify-end">
          <input type="hidden" name="profileId" value={profileId} />
          <Button type="submit" size="sm" disabled={approving}>
            Approve all {waiting} waiting
          </Button>
        </form>
      ) : null}
      <ul className="divide-y divide-tl-line rounded-control border border-tl-line" aria-label="Document checklist">
        {checklist.map((type) => {
          const doc = byType.get(type);
          const label = documentLabel(type);
          const lockedForMe = doc?.status === "approved" && !isAdmin;
          return (
            <li key={type} className={cn("flex flex-wrap items-center justify-between gap-3 px-4 py-3", doc?.status === "rejected" && "bg-tl-danger/5")}>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-body font-semibold text-tl-text">{label}</span>
                <StatusLine doc={doc} />
              </span>
              <span className="flex items-center gap-2">
                {canEdit && !lockedForMe && doc?.status !== "approved" ? (
                  <Toggle profileId={profileId} type={type} collected={doc?.status === "collected"} label={label} />
                ) : null}
                {isAdmin && doc ? <Review doc={doc} label={label} /> : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
