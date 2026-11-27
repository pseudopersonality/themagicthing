"use client";
import { useEffect, useRef, useState } from "react";
import { useApp, notifyChanged } from "@/components/Shell";
import { api, fmt } from "@/components/ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
const LIMITS = [
  ["College or city of attendees", "No college, city or demographic fields exist.", "Analyse by campaign, channel, owner, date or status.", "Add college and city to registration forms."],
  ["Causal impact of a campaign", "First-touch attribution shows association, not what would have happened without the campaign.", "Rank by attributed visitors and cost per attributed visitor.", "Holdout or staggered-rollout experiments."],
  ["Unique reach across campaigns", "Platform reach is per day and per platform; people overlap.", "Show “summed reported reach”, labelled as overlapping.", "Identity-based deduplication where platforms allow."],
  ["Why people cancelled or didn’t attend", "No reason codes are recorded.", "Count cancellations, waitlists and confirmed no-shows by campaign.", "A one-question reason on cancel and after the event."],
  ["Sponsor activation impact", "Sponsor data is outside this dataset.", "None in this dataset.", "Join sponsor data; test with a comparison group."],
];
const RULES = [
  "A selected date means the end of that day in IST; nothing recorded later appears in that snapshot.",
  "Rows repeated with the same stable ID (import retries) are counted once.",
  "Attendance = distinct external people with an admitted AND verified check-in; denied, pending, unverified and internal/staff/test records are excluded; people entering on both days count once.",
  "Registration status = each registration’s latest history version at the date (a new status is not a new person).",
  "Targets = the version in force at the date (launch plan from 15 Jan, revised plan from 15 Mar).",
  "Spend = net posted INR (vendor credits are negative) by activity date.",
  "Attribution = each person’s fixed first campaign; walk-ins have none. Names are labels only; IDs are used for every join.",
];

export default function Data() {
  const { scenario, version, meta } = useApp();
  const [o, setO] = useState<any>(null);
  const [act, setAct] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    api<any>(`/api/overview?${new URLSearchParams({ scenario })}`).then(setO).catch((e) => setMsg(e.message));
    api<any[]>("/api/activity").then(setAct).catch(() => {});
  }, [scenario, version]);

  async function upload() {
    const f = file.current?.files?.[0]; if (!f) { setMsg("Choose an .xlsx file first."); return; }
    setBusy(true);
    try {
      const fd = new FormData(); fd.append("file", f);
      const r = await fetch("/api/dataset", { method: "POST", body: fd }); const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setMsg(`Loaded ${j.name}: ${fmt(j.check.verifiedExternalVisitors)} verified visitors, ${fmt(j.check.registeredExternalPeople)} registered people, ₹${fmt(j.check.netSpendInr)} spend. Dashboard and copilot now use it (Working data).`);
      notifyChanged();
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }
  async function reset() { await api("/api/dataset", { method: "DELETE" }); setMsg("Working data reset to the original workbook."); notifyChanged(); }

  return (
    <>
      <div className="pagehead"><div><h1>Data & rules</h1><div className="sub">Where the numbers come from, how they are cleaned, and what the data cannot tell us.</div></div></div>
      {msg && <div className="banner info">{msg}</div>}
      <div className="grid g2">
        <div className="card">
          <h3>Datasets</h3>
          <p style={{ marginTop: 0, lineHeight: "21px" }}><b>Original:</b> the supplied Attendee_Dataset.xlsx, bundled read-only and never modified. <a href="/api/dataset/original">Download it</a>.<br />
            <b>Working:</b> {meta?.workingDataset ? <>uploaded <b>{meta.workingDataset.name}</b> ({meta.workingDataset.uploaded_at.slice(0, 16).replace("T", " ")} UTC)</> : "same as the original until you upload an edited copy"}.</p>
          <p className="note">To test changed data: download the original, edit any rows in Excel (keep the sheet and column names), and upload it here. Every dashboard number, campaign comparison and copilot answer recalculates from the upload. Switch the toggle at the top to compare with the original.</p>
          <div className="row" style={{ marginTop: 10 }}>
            <input ref={file} type="file" accept=".xlsx" className="in" />
            <button className="btn primary" disabled={busy} onClick={upload}>{busy ? "Checking…" : "Upload as working data"}</button>
            {meta?.workingDataset && <button className="btn" onClick={reset}>Reset to original</button>}
          </div>
        </div>
        <div className="card">
          <h3>Cleaning applied ({scenario} data)</h3>
          {o ? (<table className="t"><tbody>
            {o.quality.duplicatesRemoved.filter((q: any) => q.duplicateIdsRemoved > 0).map((q: any) => <tr key={q.sheet}><td>Duplicate IDs removed · {q.sheet}</td><td className="n">{fmt(q.duplicateIdsRemoved)}</td></tr>)}
            <tr><td>Denied check-in events excluded</td><td className="n">{fmt(o.quality.checkinOutcomes.deniedEvents)}</td></tr>
            <tr><td>Pending / unverified events excluded</td><td className="n">{fmt(o.quality.checkinOutcomes.pendingEvents)} / {fmt(o.quality.checkinOutcomes.unverifiedEvents)}</td></tr>
            <tr><td>Internal, staff and test admissions excluded</td><td className="n">{fmt(o.quality.checkinOutcomes.nonExternalVerifiedAdmissions)}</td></tr>
            <tr><td>External people admitted more than once (counted once)</td><td className="n">{fmt(o.quality.checkinOutcomes.peopleAdmittedMoreThanOnce)}</td></tr>
            <tr><td>Vendor credit rows (negative spend)</td><td className="n">{fmt(o.quality.ledgerCredits)}</td></tr>
            <tr><td>Names shared by different people</td><td className="n">{fmt(o.quality.namesSharedByMultiplePeople)}</td></tr>
          </tbody></table>) : <div className="empty">Loading…</div>}
        </div>
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <h3>Calculation rules</h3>
        <ol style={{ margin: 0, paddingLeft: 18, lineHeight: "22px" }}>{RULES.map((r) => <li key={r}>{r}</li>)}</ol>
      </div>
      <div className="card" style={{ marginTop: 14, overflowX: "auto" }}>
        <h3>What this data cannot answer (and the copilot says so)</h3>
        <table className="t"><thead><tr><th>Question</th><th>Why not</th><th>What we can show instead</th><th>What to collect next</th></tr></thead>
          <tbody>{LIMITS.map((l) => <tr key={l[0]}><td><b>{l[0]}</b></td><td>{l[1]}</td><td>{l[2]}</td><td>{l[3]}</td></tr>)}</tbody></table>
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <h3>Recent changes</h3>
        {act.length === 0 ? <div className="note">No changes yet.</div> : act.slice(0, 15).map((a) => <div key={a.id} className="ins"><span className="note mono" style={{ minWidth: 130 }}>{a.at.slice(0, 16).replace("T", " ")}</span><span>{a.summary}</span></div>)}
      </div>
    </>
  );
}
