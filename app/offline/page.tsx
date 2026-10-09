import type { Metadata } from "next";
import { StatusPage } from "@/components/features/shell/status-page";

export const metadata: Metadata = { title: "Offline" };

/** Served by the service worker when the network is down. It is public and holds no data. */
export default function OfflinePage() {
  return (
    <StatusPage
      title="You are offline"
      message="The CRM needs an internet connection. Check your connection, then reload this page. Nothing you saved has been lost."
    />
  );
}
