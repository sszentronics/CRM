import { PageHeader } from "./page-header";
import { Card } from "@/components/ui/card";
import { RequestForm } from "@/components/features/workspace/request-form";

/** Replaces every screen once a demo has run out. Data is kept; asking for access reopens it. */
export function DemoEnded({ canRequest }: { canRequest: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Your demo has ended"
        description="Your data is kept. Tell us what you need and we will reopen your workspace."
      />
      <Card className="max-w-[560px]">
        {canRequest ? <RequestForm defaultKind="upgrade" /> : <p className="text-body">Ask your workspace owner to contact us.</p>}
      </Card>
    </div>
  );
}
