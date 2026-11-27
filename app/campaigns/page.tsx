"use client";
import { useEffect, useState } from "react";
import { useApp, notifyChanged } from "@/components/Shell";
import { api, fmt, inr, pct } from "@/components/ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Plan { campaign_id: string; name: string; channel: string; owner: string; status: string; planned_budget_inr: number; notes: string; is_custom: boolean; updated_at: string; }
const STATUS = ["scale", "maintain", "pilot", "stopped", "plan_line"];
const STATUS_CLS: Record<string, string> = { scale: "good", maintain: "info", pilot: "watch", stopped: "risk", plan_line: "grey" };

export default function Campaigns() {
  const { scenario, asOf, version } = useApp();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [hist, setHist] = useState<Record<string, any>>({});
  const [ceiling, setCeiling] = useState({ reserveInr: 35000, ceilingInr: 300000 });
  const [edit, setEdit] = useState<Record<string, Partial<Plan>>>({});
  const [msg, setMsg] = useState("");
  const [nw, setNw] = useState({ name: "", owner: "", planned_budget_inr: 0, status: "pilot", notes: "" });

  async function load() {
    const p = await api<{ plans: Plan[]; reserveInr: number; ceilingInr: number }>("/api/plans");
    setPlans(p.plans); setCeiling({ reserveInr: p.reserveInr, ceilingInr: p.ceilingInr });
    const o = await api<any>(`/api/overview?${new URLSearchParams({ scenario, asOf })}`);
    setHist(Object.fromEntries(o.campaignMetrics.map((r: any) => [r.campaign_id, r])));
  }
  useEffect(() => { load().catch((e) => setMsg(e.message)); }, [scenario, asOf, version]); // eslint-disable-line react-hooks/exhaustive-deps

  const val = (p: Plan, k: keyof Plan) => (edit[p.campaign_id]?.[k] ?? p[k]) as any;
  const set = (id: string, k: keyof Plan, v: any) => setEdit((e) => ({ ...e, [id]: { ...e[id], [k]: v } }));
  async function save(p: Plan) {
    try { await api("/api/plans", { method: "POST", body: JSON.stringify({ campaign_id: p.campaign_id, ...edit[p.campaign_id] }) }); setEdit((e) => { const n = { ...e }; delete n[p.campaign_id]; return n; }); setMsg(`Saved ${p.name}.`); notifyChanged(); }
    catch (e) { setMsg((e as Error).message); }
  }
  async function remove(p: Plan) {
    if (!confirm(`Remove ${p.name}?`)) return;
    try { await api(`/api/plans/${p.campaign_id}`, { method: "DELETE" }); notifyChanged(); } catch (e) { setMsg((e as Error).message); }
  }
  async function add() {
    if (!nw.name.trim()) { setMsg("Give the new campaign a name."); return; }
    try { await api("/api/plans", { method: "POST", body: JSON.stringify(nw) }); setNw({ name: "", owner: "", planned_budget_inr: 0, status: "pilot", notes: "" }); setMsg("Campaign added."); notifyChanged(); }
    catch (e) { setMsg((e as Error).message); }
  }

  const planned = plans.reduce((a, p) => a + (Number(val(p, "planned_budget_inr")) || 0), 0);
  const left = ceiling.ceilingInr - ceiling.reserveInr - planned;

  return (
    <>
      <div className="pagehead">
        <div><h1>Campaign manager</h1><div className="sub">Plan each campaign for the next festival next to how it performed last time (to {asOf}). Changes are saved and feed the copilot.</div></div>
      </div>
      <div className="grid g5" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))", marginBottom: 14 }}>
        <div className="card kpi"><div className="label">Planned (committed)</div><div className="val">{inr(planned)}</div><div className="of">across {plans.length} campaigns and plan lines</div></div>
        <div className="card kpi"><div className="label">Gated reserve</div><div className="val">{inr(ceiling.reserveInr)}</div><div className="of">released only at the D−28 gate</div></div>
        <div className="card kpi"><div className="label">Ceiling</div><div className="val">{inr(ceiling.ceilingInr)}</div><div className="of">approved growth budget</div></div>
        <div className="card kpi"><div className="label">Headroom</div><div className="val" style={{ color: left < 0 ? "var(--bad)" : "var(--good)" }}>{inr(left)}</div><div className="of">{left < 0 ? "over the ceiling: reduce a budget" : "unallocated after reserve"}</div></div>
      </div>
      {msg && <div className="banner info">{msg}</div>}
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="t">
          <thead><tr><th>Campaign</th><th>Status</th><th>Owner</th><th className="n">Planned ₹</th><th className="n">Last: spend</th><th className="n">Last: visitors</th><th className="n">Last: ₹/visitor</th><th className="n">Last: reg→attend</th><th className="n">Summed reach*</th><th>Notes</th><th /></tr></thead>
          <tbody>
            {plans.map((p) => { const h = hist[p.campaign_id]; const dirty = Boolean(edit[p.campaign_id]); return (
              <tr key={p.campaign_id}>
                <td><b>{p.name}</b><div className="note">{p.campaign_id}{p.is_custom ? " · added" : ""}</div></td>
                <td><select className="in" value={val(p, "status")} onChange={(e) => set(p.campaign_id, "status", e.target.value)}>{STATUS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</select>
                  <div style={{ marginTop: 4 }}><span className={`pill ${STATUS_CLS[val(p, "status")]}`}>{String(val(p, "status")).replace("_", " ")}</span></div></td>
                <td><input className="in" style={{ width: 170 }} value={val(p, "owner")} onChange={(e) => set(p.campaign_id, "owner", e.target.value)} /></td>
                <td className="n"><input className="in" type="number" min={0} step={1000} style={{ width: 110, textAlign: "right" }} value={val(p, "planned_budget_inr")} onChange={(e) => set(p.campaign_id, "planned_budget_inr", Number(e.target.value))} /></td>
                <td className="n">{h ? inr(h.netSpendInr) : "—"}</td><td className="n">{h ? fmt(h.attributedVisitors) : "—"}</td><td className="n">{h ? inr(h.costPerAttributedVisitorInr) : "—"}</td><td className="n">{h ? pct(h.registrationToAttendanceRate) : "—"}</td><td className="n note">{h ? fmt(h.summedReportedReach) : "—"}</td>
                <td><textarea className="in" style={{ width: 240, height: 54 }} value={val(p, "notes")} onChange={(e) => set(p.campaign_id, "notes", e.target.value)} /></td>
                <td><div className="row"><button className="btn primary" disabled={!dirty} onClick={() => save(p)}>Save</button>{p.is_custom && <button className="btn danger" onClick={() => remove(p)}>Remove</button>}</div></td>
              </tr>); })}
          </tbody>
        </table>
        <div className="note" style={{ marginTop: 10 }}>“Last” columns come from the selected dataset and date (first-touch attribution). *Summed reported reach adds daily platform reach; people overlap across days and platforms, so it is not unique people.</div>
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <h3>Add a campaign</h3>
        <div className="row">
          <input className="in" placeholder="Name" value={nw.name} onChange={(e) => setNw({ ...nw, name: e.target.value })} />
          <input className="in" placeholder="Owner" value={nw.owner} onChange={(e) => setNw({ ...nw, owner: e.target.value })} />
          <input className="in" type="number" placeholder="Budget ₹" value={nw.planned_budget_inr || ""} onChange={(e) => setNw({ ...nw, planned_budget_inr: Number(e.target.value) })} />
          <select className="in" value={nw.status} onChange={(e) => setNw({ ...nw, status: e.target.value })}>{STATUS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</select>
          <input className="in" style={{ minWidth: 260 }} placeholder="Notes / success criteria" value={nw.notes} onChange={(e) => setNw({ ...nw, notes: e.target.value })} />
          <button className="btn primary" onClick={add}>Add</button>
        </div>
      </div>
    </>
  );
}
