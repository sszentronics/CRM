import { NextResponse, type NextRequest } from "next/server";
import { publicOrigin } from "@/lib/http/origin";
import { createClient } from "@/lib/supabase/server";

const REASONS = new Set(["disabled", "idle", "signed-out"]);

/** Ends the session and returns to the login screen with a reason it can explain. */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  // This device only. Disabling a user ends every session through the admin path instead.
  await supabase.auth.signOut({ scope: "local" });
  const reason = request.nextUrl.searchParams.get("reason");
  const url = new URL("/login", publicOrigin(request));
  if (reason && REASONS.has(reason)) url.searchParams.set("reason", reason);
  return NextResponse.redirect(url);
}
