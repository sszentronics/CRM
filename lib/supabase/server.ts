import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { publicSupabaseEnv } from "./env";

/**
 * Supabase client acting as the signed-in user, so row-level security applies.
 * Use this for every read and write a user makes.
 */
export async function createClient() {
  // Session work is always request-time. This keeps prerendering from touching the auth client's clock.
  await connection();
  const cookieStore = await cookies();
  const { url, anonKey } = publicSupabaseEnv();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only. The proxy refreshes them.
        }
      },
    },
  });
}
