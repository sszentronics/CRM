import { serviceClient } from "./accounts";
import { makeBroker, makePoolLeads, type WorldTeam } from "./world";

const hours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

/** A CNIC no other test client uses. */
export const freshCnic = () => `3${String(Math.floor(Math.random() * 1e12)).padStart(12, "0")}`;

/** A client in documents with KYC complete and approved, ready for a deposit. */
export async function readyClient(run: string, team: WorldTeam, analystId: string | null) {
  const db = serviceClient();
  const broker = await makeBroker(run, ["cnic_front"]);
  const [lead] = await makePoolLeads(run, 1);
  const { error } = await db
    .from("leads")
    .update({
      team_id: team.id,
      agent_id: team.agents[0].id,
      stage: "documents_pending",
      agent_assigned_at: hours(-72),
      last_activity_at: hours(-1),
      next_follow_up_at: hours(24),
      credited_analyst_id: analystId,
    })
    .eq("id", lead.id);
  if (error) throw error;
  const { data: profile, error: kErr } = await db
    .from("kyc_profiles")
    .insert({
      lead_id: lead.id,
      broker_id: broker.id,
      checklist: ["cnic_front"],
      cnic_number: freshCnic(),
      cnic_expiry: new Date(Date.now() + 400 * 86_400_000).toISOString().slice(0, 10),
      mother_name: "Amina Bibi",
      email: "client@example.com",
      bank_name: "Meezan Bank",
      iban: "PK36SCBL0000001123456702",
      income_band: "50k_150k",
      sim_in_own_name: true,
      consent_at: new Date().toISOString(),
      risk_level: "low",
      is_pep: false,
    })
    .select("id")
    .single();
  if (kErr) throw kErr;
  await db.from("documents").insert({ kyc_profile_id: profile!.id, type: "cnic_front", status: "approved" });
  return { lead, broker, name: `Pool ${run} 1`, brokerId: broker.id };
}

/**
 * A deposit recorded by the team's agent. With `verify`, it is also verified straight away, the way an
 * Admin would, so the feed row is written by the database trigger.
 */
export async function seedDeposit(
  team: WorldTeam,
  client: { lead: { id: string }; brokerId: string },
  amount: number,
  reference: string,
  opts: { verify?: boolean; analystId?: string | null } = {},
) {
  const db = serviceClient();
  const { data, error } = await db
    .from("deposits")
    .insert({
      lead_id: client.lead.id,
      broker_id: client.brokerId,
      type: "first",
      agent_id: team.agents[0].id,
      team_id: team.id,
      credited_analyst_id: opts.analystId ?? null,
      amount_pkr: amount,
      deposit_date: new Date().toISOString().slice(0, 10),
      method: "bank_transfer",
      reference_no: reference,
      created_by: team.agents[0].id,
    })
    .select("id")
    .single();
  if (error) throw error;
  if (opts.verify) {
    const { error: vErr } = await db
      .from("deposits")
      .update({ status: "verified", verified_at: new Date().toISOString(), verified_by: team.lead.id })
      .eq("id", data.id);
    if (vErr) throw vErr;
    await db.from("leads").update({ stage: "deposit_verified", next_follow_up_at: null }).eq("id", client.lead.id);
  }
  return data.id as string;
}
