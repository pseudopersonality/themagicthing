import { listTasks, createTask } from "@/lib/store";
import { json, bad, body } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET() { return json(await listTasks()); }
export async function POST(req: Request) {
  const b = await body<{ title?: string; owner?: string; due_date?: string; status?: string; campaign_id?: string; notes?: string; source?: string }>(req);
  if (!b.title || !String(b.title).trim()) return bad("A task needs a title.");
  return json(await createTask({ ...b, title: String(b.title).trim() } as never), 201);
}
