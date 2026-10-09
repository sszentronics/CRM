"use server";

import { getSessionContext } from "@/lib/auth/session";
import { needsMfa } from "@/lib/auth/roles";
import { normalisePhone } from "@/lib/format/phone";
import { normaliseCnic } from "@/lib/kyc/fields";
import type { Stage } from "@/lib/leads/stages";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type SearchHit = { id: string; full_name: string; phone: string; stage: Stage };
export type SearchResult = {
  hits: SearchHit[];
  /** True when the phone exists but on a lead the caller may not open. Nothing else is revealed. */
  elsewhere: boolean;
  tooShort?: boolean;
};

const MIN_CHARS = 3;
const LIMIT = 8;

/**
 * Search leads by name or phone. Results come through the caller's own session,
 * so row-level security decides what they may see.
 */
export async function searchLeads(query: string, limit = LIMIT): Promise<SearchResult> {
  const q = (query ?? "").trim().slice(0, 80);
  if (q.length < MIN_CHARS) return { hits: [], elsewhere: false, tooShort: true };

  const ctx = await getSessionContext();
  const profile = ctx?.profile;
  if (!ctx || !profile?.is_active || (needsMfa(profile.role) && ctx.aal !== "aal2")) return { hits: [], elsewhere: false };

  const supabase = await createClient();
  const select = "id, full_name, phone, stage";
  const max = Math.min(Math.max(limit, 1), 50);
  // A CNIC (13 digits): match the client's KYC profile, within the caller's scope.
  const cnic = normaliseCnic(q);
  if (cnic) {
    const { data } = await supabase.from("kyc_profiles").select("lead:leads (id, full_name, phone, stage)").eq("cnic_number", cnic).limit(1);
    const hit = (data?.[0] as unknown as { lead: SearchHit | null } | undefined)?.lead;
    if (hit) return { hits: [hit], elsewhere: false };
    const { data: owner } = await createAdminClient().rpc("lead_with_cnic", { p_cnic: cnic });
    return { hits: [], elsewhere: !!owner };
  }

  const digits = q.replace(/\D/g, "");
  const phoneLike = /^[+\d\s\-()]+$/.test(q) && digits.length >= MIN_CHARS;

  if (phoneLike) {
    const full = normalisePhone(q);
    if (full) {
      const { data } = await supabase.from("leads").select(select).eq("phone", full).limit(1);
      if (data && data.length > 0) return { hits: data as SearchHit[], elsewhere: false };
      // Not visible to this user: say only that it exists.
      const { data: exists } = await createAdminClient().rpc("existing_lead_phones", { phones: [full] });
      return { hits: [], elsewhere: Array.isArray(exists) && exists.length > 0 };
    }
    // Part of a number: match the digits anywhere in the stored phone.
    const { data } = await supabase.from("leads").select(select).like("phone", `%${digits.replace(/^0/, "")}%`).limit(max);
    return { hits: (data ?? []) as SearchHit[], elsewhere: false };
  }

  const pattern = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const { data } = await supabase
    .from("leads")
    .select(select)
    .ilike("full_name", pattern)
    .order("created_at", { ascending: false })
    .limit(max);
  return { hits: (data ?? []) as SearchHit[], elsewhere: false };
}
