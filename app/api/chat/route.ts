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

// Diagnostic: open /api/chat in a browser to test the Gemini key and model without tools.
export async function GET() {
  const key = process.env.GEMINI_API_KEY, model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  if (!key) return json({ ok: false, problem: "GEMINI_API_KEY is not set in Vercel → Settings → Environment Variables (then redeploy)." });
  const t0 = Date.now();
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", signal: ctrl.signal, headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Reply with exactly: OK" }] }] }),
    });
    const txt = await r.text();
    let reply = ""; try { reply = JSON.parse(txt).candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || ""; } catch {}
    return json({ ok: r.ok, model, httpStatus: r.status, ms: Date.now() - t0, reply: reply.slice(0, 100), googleError: r.ok ? undefined : txt.slice(0, 600) });
  } catch (e) {
    return json({ ok: false, model, ms: Date.now() - t0, problem: (e as Error).name === "AbortError" ? "Gemini did not answer within 25s." : (e as Error).message });
  } finally { clearTimeout(timer); }
}
