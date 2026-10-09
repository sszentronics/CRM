import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ROLE_HOME } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";

/** Sends each role to its own home screen. */
export default function Home() {
  return (
    <Suspense>
      <RoleHome />
    </Suspense>
  );
}

async function RoleHome(): Promise<never> {
  const { profile } = await requireSession();
  redirect(ROLE_HOME[profile.role]);
}
