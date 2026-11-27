"use client";
import { useEffect, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from "recharts";
import { useApp, notifyChanged } from "@/components/Shell";
import { api, fmt, pct } from "@/components/ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
const GROUPS: { title: string; keys: string[] }[] = [
  { title: "Capacity (people we can staff)", keys: ["activeColleges", "registrationsPerCollege", "activeAmbassadors", "registrationsPerAmbassador"] },
  { title: "Referrals, paid and carry-over", keys: ["referralsPerRegistrant", "paidBudgetInr", "paidCostPerRegistrationInr", "organicCommunityRegistrations", "organicCommunityAttendees"] },
  { title: "Show-up rates (history) and benchmark", keys: ["showUpPartnerships", "showUpAmbassadors", "showUpReferrals", "showUpPaid", "benchmarkAttendees"] },
];

export default function Plan() {
  const { version } = useApp();
  const [d, setD] = useState<any>(null);
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState("");
  useEffect(() => { api<any>("/api/plan").then((x) => { setD(x); setDraft({}); }).catch((e) => setMsg(e.message)); }, [version]);
  if (!d) return <div className="empty">{msg || "Loading plan…"}</div>;

  const dirty = Object.keys(draft).length > 0;
  const f = d.current;
  const sens = f.sensitivity.map((s: any) => ({ m: `${Math.round(s.multiplier * 100)}%`, attendees: Math.round(s.attendees) }));
  async function save() { try { const x = await api<any>("/api/plan", { method: "PUT", body: JSON.stringify(draft) }); setD(x); setDraft({}); setMsg("Plan saved. Forecast and copilot now use these inputs."); notifyChanged(); } catch (e) { setMsg((e as Error).message); } }
  async function reset() { if (!confirm("Reset all plan inputs to the strategy defaults?")) return; const x = await api<any>("/api/plan", { method: "DELETE" }); setD(x); setDraft({}); setMsg("Reset to defaults."); notifyChanged(); }
  async function preview() { const x = await api<any>("/api/plan"); setD({ ...x, current: (await previewForecast({ ...x.inputs, ...draft })) }); }

  return (
    <>
      <div className="pagehead">
        <div><h1>Plan & forecast · next festival</h1><div className="sub">Attendees = capacity × productivity × historical show-up. Every input is an editable assumption; its basis is shown.</div></div>
        <div className="toolbar"><button className="btn" onClick={reset}>Reset to defaults</button><button className="btn" disabled={!dirty} onClick={preview}>Preview</button><button className="btn primary" disabled={!dirty} onClick={save}>Save plan</button></div>
      </div>
      {msg && <div className="banner info">{msg}</div>}
      <div className="grid g5" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
        <div className="card kpi"><div className="label">Forecast attendees (saved plan)</div><div className="val">{fmt(f.totalAttendees)}</div><div className="of">{pct(f.vsBenchmarkPct)} vs benchmark {fmt(d.inputs.benchmarkAttendees)}</div></div>
        <div className="card kpi"><div className="label">Forecast registrations</div><div className="val">{fmt(f.totalRegistrations)}</div><div className="of">all channels</div></div>
        <div className="card kpi"><div className="label">Break-even productivity</div><div className="val">{f.breakEven ? `−${pct(f.breakEven.shortfallPct)}` : "—"}</div><div className="of">{f.breakEven ? `≈${fmt(f.breakEven.registrationsPerCollege, 1)} per college, ≈${fmt(f.breakEven.registrationsPerAmbassador, 1)} per ambassador` : ""}</div></div>
        <div className="card kpi"><div className="label">Reference scenarios</div><div className="val" style={{ fontSize: 22 }}>{fmt(d.reference.base.totalAttendees)} / {fmt(d.reference.stretch.totalAttendees)}</div><div className="of">base / stretch (headline 2,500 / 3,100)</div></div>
      </div>
      <div className="grid g3" style={{ marginTop: 14 }}>
        <div className="card" style={{ overflowX: "auto" }}>
          <h3>Forecast by channel</h3>
          <table className="t"><thead><tr><th>Channel</th><th>Driver</th><th className="n">Registrations</th><th className="n">Show-up</th><th className="n">Attendees</th></tr></thead>
            <tbody>{f.channels.map((c: any) => <tr key={c.channel}><td><b>{c.channel}</b></td><td className="note">{c.driver}</td><td className="n">{fmt(c.registrations)}</td><td className="n">{pct(c.showUp)}</td><td className="n"><b>{fmt(c.attendees)}</b></td></tr>)}
              <tr className="total"><td>Total</td><td /><td className="n">{fmt(f.totalRegistrations)}</td><td /><td className="n">{fmt(f.totalAttendees)}</td></tr></tbody></table>
          <div className="note" style={{ marginTop: 10 }}>Referral seeds = partnership + ambassador + paid registrations (organic/community excluded). Arrival support could add up to {fmt(f.upsideNotCounted.arrivalSupportMax)} attendees; it is not counted. Forecasts are attributed, not proven incremental lift.</div>
        </div>
        <div className="card">
          <h3>Sensitivity to per-unit productivity</h3>
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={sens} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#EEF1F5" vertical={false} />
              <XAxis dataKey="m" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} width={46} />
              <Tooltip formatter={(v: any) => fmt(v)} />
              <ReferenceLine y={d.inputs.benchmarkAttendees} stroke="#5B6676" strokeDasharray="4 3" label={{ value: "benchmark", fontSize: 11, fill: "#5B6676", position: "insideBottomRight" }} />
              <Line type="monotone" dataKey="attendees" stroke="#1F6FEB" strokeWidth={2.5} />
            </LineChart>
          </ResponsiveContainer>
          <div className="note">X axis: registrations per college and per ambassador as % of plan.</div>
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))", marginTop: 14 }}>
        {GROUPS.map((g) => (
          <div className="card" key={g.title}>
            <h3>{g.title}</h3>
            {g.keys.map((k) => { const m = d.meta[k]; const v = draft[k] ?? d.inputs[k]; const changed = draft[k] !== undefined && draft[k] !== d.inputs[k]; return (
              <div className="field" key={k} style={{ marginBottom: 12 }}>
                <label>{m.label}{m.unit ? ` (${m.unit})` : ""} {changed && <span className="pill watch">unsaved</span>}</label>
                <input className="in" type="number" step={m.step} min={0} value={v} onChange={(e) => setDraft({ ...draft, [k]: Number(e.target.value) })} />
                <div className="note">{m.basis} · default {d.defaults[k]}</div>
              </div>); })}
          </div>
        ))}
      </div>
    </>
  );
}

async function previewForecast(inputs: Record<string, number>) {
  const { forecast } = await import("@/lib/plan");
  return forecast(inputs as any);
}
