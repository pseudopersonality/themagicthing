import { listPlans, upsertPlan, RESERVE_INR } from "@/lib/store";
import { json, bad, body } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET() { return json({ plans: await listPlans(), reserveInr: RESERVE_INR, ceilingInr: 300000 }); }
export async function POST(req: Request) {
  const b = await body(req);
  if (!b.campaign_id && !b.name) return bad("A new campaign needs a name.");
  return json(await upsertPlan(b as never));
}
