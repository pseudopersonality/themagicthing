import { deletePlan } from "@/lib/store";
import { json, bad } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return (await deletePlan(id)) ? json({ ok: true }) : bad("Only campaigns you added can be removed; historical campaigns can be set to 'stopped'.", 400);
}
