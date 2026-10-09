"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Browser client for the signed-in user. Used for direct uploads such as profile photos. */
export function createBrowserSupabase() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

/**
 * Give the Realtime socket the signed-in user's token before subscribing. Without it the socket
 * joins as the anonymous key and row-level security hides every row.
 */
export async function authorizeRealtime(client: ReturnType<typeof createBrowserSupabase>) {
  const { data } = await client.auth.getSession();
  if (data.session) await client.realtime.setAuth(data.session.access_token);
}
