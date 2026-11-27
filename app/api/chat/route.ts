import { chat, type ChatTurn } from "@/lib/copilot";
import { parseScenario } from "@/lib/source";
import { json, bad, body } from "@/lib/http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(req: Request) {
  const b = await body<{ messages?: ChatTurn[]; asOf?: string; scenario?: string }>(req);
  const msgs = (b.messages || []).filter((m) => m && typeof m.text === "string" && (m.role === "user" || m.role === "assistant"));
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return bad("Send at least one user message.");
  try {
    const out = await chat(msgs, { asOf: /^\d{4}-\d{2}-\d{2}$/.test(b.asOf || "") ? b.asOf! : "2025-04-20", scenario: parseScenario(b.scenario) });
    return json(out);
  } catch (e) { return json({ reply: `Something went wrong: ${(e as Error).message}`, trace: [], proposals: [], error: "exception" }); }
}
