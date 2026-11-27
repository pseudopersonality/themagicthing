import { updateTask, deleteTask } from "@/lib/store";
import { json, bad, body } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params; const t = await updateTask(Number(id), await body(req));
  return t ? json(t) : bad("Task not found", 404);
}
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params; return (await deleteTask(Number(id))) ? json({ ok: true }) : bad("Task not found", 404);
}
