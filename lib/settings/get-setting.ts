import type { SupabaseClient } from "@supabase/supabase-js";
import { parseSetting, SETTING_KEYS, type SettingKey, type SettingValue } from "./definitions";

/**
 * Read one setting. Pass the client of the caller (user session on the server,
 * service client in scripts). A missing or malformed row falls back to the default.
 */
export async function getSetting<K extends SettingKey>(client: SupabaseClient, key: K): Promise<SettingValue<K>> {
  const { data } = await client.from("settings").select("value").eq("key", key).maybeSingle();
  return parseSetting(key, data?.value);
}

/** All settings at once, for screens that need several. */
export async function getAllSettings(client: SupabaseClient): Promise<{ [K in SettingKey]: SettingValue<K> }> {
  const { data } = await client.from("settings").select("key, value");
  const byKey = new Map((data ?? []).map((r) => [r.key as string, r.value]));
  return Object.fromEntries(SETTING_KEYS.map((k) => [k, parseSetting(k, byKey.get(k))])) as unknown as {
    [K in SettingKey]: SettingValue<K>;
  };
}
