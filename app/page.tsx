"use client";
import { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, BarChart, Cell, LabelList } from "recharts";
import { useApp } from "@/components/Shell";
import { Kpi, fmt, inr, pct } from "@/components/ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Overview = any;

const PRESETS = [
  { d: "2025-02-01", l: "1 Feb" }, { d: "2025-03-01", l: "1 Mar" }, { d: "2025-03-15", l: "Plan revised" },
  { d: "2025-04-11", l: "Eve of event" }, { d: "2025-04-13", l: "Event end" }, { d: "2025-04-20", l: "Final" },
];
const COLS: { key: string; label: string; fmt: (v: any) => string }[] = [
  { key: "netSpendInr", label: "Net spend", fmt: inr },
  { key: "identifiedPeople", label: "Identified", fmt: (v) => fmt(v) },
  { key: "registrations", label: "Registrations", fmt: (v) => fmt(v) },
  { key: "confirmed", label: "Confirmed now", fmt: (v) => fmt(v) },
  { key: "attributedVisitors", label: "Verified visitors", fmt: (v) => fmt(v) },
  { key: "registrationToAttendanceRate", label: "Reg → attend", fmt: (v) => pct(v) },
  { key: "costPerRegistrationInr", label: "₹ / registration", fmt: inr },
  { key: "costPerAttributedVisitorInr", label: "₹ / visitor", fmt: inr },
  { key: "optOuts", label: "Opt-outs", fmt: (v) => fmt(v) },
];

export default function Dashboard() {
  const { scenario, asOf, setAsOf, version } = useApp();
  const [campaign, setCampaign] = useState("");
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "netSpendInr", dir: -1 });

  useEffect(() => {
    const q = new URLSearchParams({ scenario, asOf, ...(campaign ? { campaign } : {}) });
    fetch(`/api/overview?${q}`).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setData(j); setErr(""); }).catch((e) => setErr(e.message));
  }, [scenario, asOf, campaign, version]);

  const rows = useMemo(() => {
    if (!data) return [];
    return [...data.campaignMetrics].sort((a: any, b: any) => ((a[sort.key] ?? -1) - (b[sort.key] ?? -1)) * sort.dir);
  }, [data, sort]);

  if (err) return <div className="banner">Could not load data: {err}</div>;
  if (!data) return <div className="empty">Loading dashboard…</div>;
  const k = data.kpis, t = k.target;
  const totals = data.campaignMetrics.reduce((a: any, r: any) => { for (const c of ["netSpendInr", "identifiedPeople", "registrations", "confirmed", "attributedVisitors", "optOuts"]) a[c] = (a[c] || 0) + r[c]; return a; }, {});
  const series = data.series.map((s: any) => ({ ...s, label: s.date.slice(5) }));
  const funnelMax = data.funnel.stages[0]?.value || 1;

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>{data.event.event_name} · attendee growth</h1>
          <div className="sub">Snapshot at the end of <b>{k.asOf}</b> (IST) · {k.eventPhase}{k.daysToEvent > 0 ? `, ${k.daysToEvent} days to the event` : ""} · targets: <b>{t?.target_version ?? "none yet"}</b> · {data.label}</div>
        </div>
        <div className="toolbar">
          <input className="in" type="date" value={asOf} min={data.event.history_start.slice(0, 10)} max={data.event.history_end.slice(0, 10)} onChange={(e) => e.target.value && setAsOf(e.target.value)} />
          <div className="seg">{PRESETS.map((p) => <button key={p.d} className={asOf === p.d ? "on" : ""} onClick={() => setAsOf(p.d)}>{p.l}</button>)}</div>
        </div>
      </div>

      <div className="grid g5">
        <Kpi label="Verified external visitors" value={fmt(k.verifiedExternalVisitors)} of={t ? `of ${fmt(t.unique_external_visitors_goal)} goal · ${fmt(k.campaignAttributedVisitors)} campaign + ${fmt(k.walkInVisitors)} walk-in` : undefined} progress={k.progress?.visitorPct} />
        <Kpi label="Registered external people" value={fmt(k.registeredExternalPeople)} of={t ? `of ${fmt(t.registration_goal)} goal` : undefined} progress={k.progress?.registrationPct} />
        <Kpi label="Identified external people" value={fmt(k.identifiedExternalPeople)} of={t ? `of ${fmt(t.identified_external_people_goal)} goal` : undefined} progress={k.progress?.identifiedPct} />
        <Kpi label="Net marketing spend" value={inr(k.netSpendInr)} of={k.budgetInr ? `of ${inr(k.budgetInr)} budget (${pct(k.budgetUsedPct)} used)` : undefined} progress={k.budgetUsedPct} />
        <Kpi label="Cost per verified visitor" value={inr(k.costPerVerifiedVisitorInr)} of={`${inr(k.costPerRegisteredPersonInr)} per registered person`}
          note={k.showUpRateOfConfirmed !== null ? `${pct(k.showUpRateOfConfirmed)} of confirmed registrants attended; ${fmt(k.confirmedWithoutVerifiedAdmission)} did not.` : `${fmt(k.confirmedRegistrants)} currently confirmed.`} />
      </div>

      <div className="grid g3" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
            <h3 style={{ margin: 0 }}>Progress over time</h3>
            <select className="in" value={campaign} onChange={(e) => setCampaign(e.target.value)}>
              <option value="">All campaigns</option>
              {data.campaigns.map((c: any) => <option key={c.campaign_id} value={c.campaign_id}>{c.campaign_name}</option>)}
            </select>
          </div>
          <div className="note" style={{ margin: "2px 0 4px" }}>People: registrations and verified visitors vs the goals in force</div>
          <ResponsiveContainer width="100%" height={250}>
            <ComposedChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#EEF1F5" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#5B6676" }} minTickGap={24} />
              <YAxis tick={{ fontSize: 11, fill: "#5B6676" }} width={48} />
              <Tooltip formatter={(v: any, n: any) => [fmt(v), n]} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="registrations" name="New registrations / day" fill="#BBD0F7" />
              <Line type="monotone" dataKey="cumRegistrations" name="Registrations (cumulative)" stroke="#1F6FEB" strokeWidth={2.5} dot={false} />
              {!campaign && <Line type="stepAfter" dataKey="registrationGoal" name="Registration goal" stroke="#1F6FEB" strokeDasharray="5 4" dot={false} />}
              <Line type="monotone" dataKey="cumVisitors" name="Verified visitors" stroke="#17693A" strokeWidth={2.5} dot={false} />
              {!campaign && <Line type="stepAfter" dataKey="visitorGoal" name="Visitor goal" stroke="#17693A" strokeDasharray="5 4" dot={false} />}
            </ComposedChart>
          </ResponsiveContainer>
          <div className="note" style={{ margin: "10px 0 4px" }}>Money: cumulative net spend vs the budget in force</div>
          <ResponsiveContainer width="100%" height={150}>
            <ComposedChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#EEF1F5" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#5B6676" }} minTickGap={24} />
              <YAxis tick={{ fontSize: 11, fill: "#5B6676" }} width={48} tickFormatter={(v) => `₹${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v: any, n: any) => [inr(v), n]} />
              <Bar dataKey="spend" name="Spend / day" fill="#C9D1DD" />
              <Line type="monotone" dataKey="cumSpend" name="Cumulative spend" stroke="#0F1B33" strokeWidth={2} dot={false} />
              {!campaign && <Line type="stepAfter" dataKey="budget" name="Budget" stroke="#0F1B33" strokeDasharray="5 4" dot={false} />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <h3>What the data says</h3>
          {data.insights.map((i: any, n: number) => (
            <div className="ins" key={n}><span className={`pill ${i.level}`}>{i.level === "good" ? "Good" : i.level === "risk" ? "Risk" : "Watch"}</span><span>{i.text}</span></div>
          ))}
          <div className="note" style={{ marginTop: 8 }}>Rule-based observations computed from the selected snapshot. Ask the copilot to explain any of them.</div>
        </div>
      </div>

      <div className="grid g2" style={{ marginTop: 14 }}>
        <div className="card">
          <h3>Funnel{campaign ? ` · ${data.campaigns.find((c: any) => c.campaign_id === campaign)?.campaign_name}` : " · all external people"}</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.funnel.stages} layout="vertical" margin={{ left: 10, right: 50 }}>
              <XAxis type="number" hide domain={[0, funnelMax]} />
              <YAxis type="category" dataKey="stage" width={210} tick={{ fontSize: 12, fill: "#0F1B33" }} />
              <Tooltip formatter={(v: any) => fmt(v)} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {data.funnel.stages.map((_: any, i: number) => <Cell key={i} fill={i === data.funnel.stages.length - 1 ? "#17693A" : "#1F6FEB"} fillOpacity={1 - i * 0.12} />)}
                <LabelList dataKey="value" position="right" formatter={(v: any) => fmt(v)} style={{ fontSize: 12, fill: "#0F1B33", fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="note">People are counted once, by their fixed first campaign. “Currently confirmed” uses each registration’s latest status on the selected date.</div>
        </div>
        <div className="card">
          <h3>Registration status on {k.asOf}</h3>
          <table className="t"><tbody>
            {(["confirmed", "interested", "waitlisted", "cancelled"] as const).map((s) => (
              <tr key={s}><td style={{ textTransform: "capitalize" }}>{s}</td><td className="n">{fmt(k.registrationStatus[s])}</td><td className="n note">{pct(k.registrationStatus[s] / (k.externalRegistrations || 1))}</td></tr>
            ))}
            <tr className="total"><td>External registrations</td><td className="n">{fmt(k.externalRegistrations)}</td><td /></tr>
          </tbody></table>
          <div className="note" style={{ marginTop: 10 }}>Target versions: {data.targets.map((x: any) => `${x.target_version} (from ${x.effective_at.slice(0, 10)})`).join(" → ")}. The dashboard uses whichever was in force on the selected date.</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14, overflowX: "auto" }}>
        <h3>Campaign performance to {k.asOf}</h3>
        <table className="t">
          <thead><tr><th>Campaign</th>
            {COLS.map((c) => <th key={c.key} className="n sortable" onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : -1 }))}>{c.label}{sort.key === c.key ? (sort.dir === -1 ? " ↓" : " ↑") : ""}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.campaign_id}><td><b>{r.campaign_name}</b><div className="note">{r.owner_name}</div></td>
                {COLS.map((c) => <td key={c.key} className="n">{c.fmt(r[c.key])}</td>)}</tr>
            ))}
            <tr className="total"><td>All campaigns</td>
              <td className="n">{inr(totals.netSpendInr)}</td><td className="n">{fmt(totals.identifiedPeople)}</td><td className="n">{fmt(totals.registrations)}</td><td className="n">{fmt(totals.confirmed)}</td><td className="n">{fmt(totals.attributedVisitors)}</td>
              <td className="n">—</td><td className="n">{inr(totals.registrations ? totals.netSpendInr / totals.registrations : null)}</td><td className="n">{inr(totals.attributedVisitors ? totals.netSpendInr / totals.attributedVisitors : null)}</td><td className="n">{fmt(totals.optOuts)}</td></tr>
          </tbody>
        </table>
        <div className="note" style={{ marginTop: 10 }}>Attribution: each person’s fixed first campaign (first touch); it shows association, not causal lift. Reg → attend appears after the event. Walk-ins ({fmt(k.walkInVisitors)}) have no campaign. Platform reach is reported per day and overlaps, so it is shown on the Campaigns page as “summed reported reach”, never as unique people.</div>
      </div>
    </>
  );
}
