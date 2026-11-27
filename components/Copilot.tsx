"use client";
import { useEffect, useRef, useState } from "react";
import { useApp, notifyChanged } from "./Shell";
import { api } from "./ui";

interface Proposal { type: "create_task" | "update_plan_inputs" | "update_campaign_plan"; summary: string; payload: Record<string, unknown>; reason?: string; state?: "pending" | "done" | "dismissed" | "error"; note?: string; }
interface Msg { role: "user" | "assistant"; text: string; trace?: { name: string; ok: boolean }[]; proposals?: Proposal[]; error?: boolean; }

const STARTERS = [
  "Which campaign drove the most verified attendance, and at what cost?",
  "Why did we miss the attendee goal?",
  "Which campaign caused the most attendance?",
  "Which college sent the most attendees?",
  "What if only 30 ambassadors are active?",
  "Create a task to fix the biggest no-show problem.",
];

export default function Copilot() {
  const { asOf, scenario, meta } = useApp();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  async function send(text: string) {
    const q = text.trim(); if (!q || busy) return;
    const next: Msg[] = [...msgs, { role: "user", text: q }];
    setMsgs(next); setInput(""); setBusy(true);
    try {
      const r = await api<{ reply: string; trace: { name: string; ok: boolean }[]; proposals: Proposal[]; error?: string }>("/api/chat", {
        method: "POST", body: JSON.stringify({ messages: next.map((m) => ({ role: m.role, text: m.text })), asOf, scenario }),
      });
      setMsgs([...next, { role: "assistant", text: r.reply, trace: r.trace, proposals: (r.proposals || []).map((p) => ({ ...p, state: "pending" })), error: r.error === "not_configured" }]);
    } catch (e) {
      setMsgs([...next, { role: "assistant", text: `Request failed: ${(e as Error).message}`, error: true }]);
    } finally { setBusy(false); }
  }

  async function act(mi: number, pi: number, confirm: boolean) {
    const p = msgs[mi].proposals![pi];
    const update = (patch: Partial<Proposal>) => setMsgs((m) => m.map((x, i) => i !== mi ? x : { ...x, proposals: x.proposals!.map((y, j) => j !== pi ? y : { ...y, ...patch }) }));
    if (!confirm) { update({ state: "dismissed" }); return; }
    try {
      if (p.type === "create_task") await api("/api/tasks", { method: "POST", body: JSON.stringify(p.payload) });
      if (p.type === "update_plan_inputs") await api("/api/plan", { method: "PUT", body: JSON.stringify(p.payload) });
      if (p.type === "update_campaign_plan") await api("/api/plans", { method: "POST", body: JSON.stringify(p.payload) });
      update({ state: "done" }); notifyChanged();
    } catch (e) { update({ state: "error", note: (e as Error).message }); }
  }

  return (
    <aside className="cp">
      <div className="cp-head">
        <div><b>Growth copilot</b><div className="note">Answers from your data at {asOf} · {scenario} data</div></div>
        {msgs.length > 0 && <button className="btn ghost" onClick={() => setMsgs([])}>Clear</button>}
      </div>
      <div className="cp-body">
        {meta && !meta.copilotConfigured && <div className="banner">Copilot not configured: set <b>GEMINI_API_KEY</b> in the deployment’s environment variables.</div>}
        {msgs.length === 0 && (
          <>
            <div className="note">Ask about performance, targets, costs or the next-festival plan. Every number comes from the same calculations as the dashboard; the copilot says when the data can’t answer, and asks before saving anything.</div>
            <div className="chips">{STARTERS.map((s) => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}</div>
          </>
        )}
        {msgs.map((m, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column" }}>
            <div className={`msg ${m.role === "user" ? "user" : "bot"} ${m.error ? "err" : ""}`}>
              {m.text}
              {m.trace && m.trace.length > 0 && <div className="trace">Checked: {[...new Set(m.trace.map((t) => t.name))].join(", ")}</div>}
              {m.proposals?.map((p, j) => (
                <div className="prop" key={j}>
                  <div className="k">{p.type === "create_task" ? "Proposed task" : p.type === "update_plan_inputs" ? "Proposed plan change" : "Proposed campaign change"}</div>
                  <div style={{ marginTop: 4 }}>{p.summary}</div>
                  {p.reason && <div className="note" style={{ marginTop: 4 }}>Why: {p.reason}</div>}
                  <div className="row" style={{ marginTop: 8 }}>
                    {p.state === "pending" && <><button className="btn primary" onClick={() => act(i, j, true)}>Confirm</button><button className="btn" onClick={() => act(i, j, false)}>Dismiss</button></>}
                    {p.state === "done" && <span className="pill good">Saved · views updated</span>}
                    {p.state === "dismissed" && <span className="pill grey">Dismissed</span>}
                    {p.state === "error" && <span className="pill risk">Failed: {p.note}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {busy && <div className="msg bot">Checking the data…</div>}
        <div ref={end} />
      </div>
      <div className="cp-foot">
        <textarea value={input} placeholder="Ask a question…" onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }} />
        <button className="btn primary" disabled={busy || !input.trim()} onClick={() => send(input)}>Send</button>
      </div>
    </aside>
  );
}
