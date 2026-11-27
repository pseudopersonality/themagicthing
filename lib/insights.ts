// Deterministic, data-driven insights (no AI): each one states its numbers and basis.
import type { Dataset } from "./dataset";
import { kpis, campaignMetrics } from "./metrics";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const pct = (n: number) => `${Math.round(n * 100)}%`;

export function insights(ds: Dataset, asOf?: string) {
  const k = kpis(ds, asOf);
  const c = campaignMetrics(ds, k.asOf).rows;
  const out: { level: "good" | "watch" | "risk"; text: string }[] = [];
  const t = k.target;
  if (t) {
    if (k.eventPhase === "post-event") {
      const gap = t.unique_external_visitors_goal - k.verifiedExternalVisitors;
      out.push({ level: gap > 0 ? "risk" : "good", text: gap > 0
        ? `Verified external visitors reached ${k.verifiedExternalVisitors.toLocaleString("en-IN")} of the ${t.unique_external_visitors_goal.toLocaleString("en-IN")} goal (${gap.toLocaleString("en-IN")} short).`
        : `Verified external visitors (${k.verifiedExternalVisitors.toLocaleString("en-IN")}) met the ${t.unique_external_visitors_goal.toLocaleString("en-IN")} goal.` });
    } else {
      out.push({ level: (k.progress?.registrationPct ?? 0) < 0.5 && k.daysToEvent < 30 ? "risk" : "watch",
        text: `${k.registeredExternalPeople.toLocaleString("en-IN")} external people registered: ${pct(k.progress?.registrationPct ?? 0)} of the ${t.registration_goal.toLocaleString("en-IN")} goal with ${k.daysToEvent} days to go.` });
    }
    if (k.budgetInr) {
      const left = k.budgetInr - k.netSpendInr;
      out.push({ level: left < 0 ? "risk" : "watch", text: left >= 0 ? `${inr(left)} of the ${inr(k.budgetInr)} budget is unspent (${pct(k.budgetUsedPct ?? 0)} used).` : `Spend is ${inr(-left)} over the ${inr(k.budgetInr)} budget.` });
    }
  }
  const withVis = c.filter((r) => r.attributedVisitors > 0 && r.costPerAttributedVisitorInr !== null);
  if (withVis.length >= 2) {
    const s = [...withVis].sort((a, b) => a.costPerAttributedVisitorInr! - b.costPerAttributedVisitorInr!);
    out.push({ level: "good", text: `Cheapest attributed visitors: ${s[0].campaign_name} at ${inr(s[0].costPerAttributedVisitorInr!)}; most expensive: ${s[s.length - 1].campaign_name} at ${inr(s[s.length - 1].costPerAttributedVisitorInr!)}.` });
    const paid = c.filter((r) => ["paid_social", "creators"].includes(r.channel));
    const totSpend = c.reduce((a, r) => a + r.netSpendInr, 0), totVis = c.reduce((a, r) => a + r.attributedVisitors, 0);
    const pSpend = paid.reduce((a, r) => a + r.netSpendInr, 0), pVis = paid.reduce((a, r) => a + r.attributedVisitors, 0);
    if (totSpend > 0 && totVis > 0 && paid.length) out.push({ level: "watch", text: `Paid social + creators used ${pct(pSpend / totSpend)} of spend but produced ${pct(pVis / totVis)} of attributed visitors.` });
  }
  const rates = c.filter((r) => r.registrationToAttendanceRate !== null && r.registeredPeople >= 50);
  if (rates.length >= 2) {
    const s = [...rates].sort((a, b) => b.registrationToAttendanceRate! - a.registrationToAttendanceRate!);
    out.push({ level: "watch", text: `Registrant show-up ranged from ${pct(s[0].registrationToAttendanceRate!)} (${s[0].campaign_name}) to ${pct(s[s.length - 1].registrationToAttendanceRate!)} (${s[s.length - 1].campaign_name}).` });
  }
  if (k.confirmedWithoutVerifiedAdmission && k.eventPhase === "post-event") out.push({ level: "risk", text: `${k.confirmedWithoutVerifiedAdmission.toLocaleString("en-IN")} confirmed external registrants have no verified admission; reasons are not recorded.` });
  if (k.registrationStatus.waitlisted > 0) out.push({ level: "watch", text: `${k.registrationStatus.waitlisted} registrations are waitlisted as of ${k.asOf}.` });
  return out;
}
