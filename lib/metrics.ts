// Metric engine: every number in the dashboard and the copilot comes from here.
// Rules (from the dataset's own field guide):
//  - A selected date means the END of that day in IST; nothing later may appear.
//  - Duplicate source IDs were removed at import (see dataset.ts).
//  - Attendance = distinct EXTERNAL people with an admitted AND verified check-in.
//  - Registration state = latest history version per registration at or before the date.
//  - Targets = the latest target version effective at or before the date.
//  - Spend = net posted INR (credits are negative) with activity_date on or before the date.
import type { Dataset, Target } from "./dataset";

export const STATUSES = ["interested", "confirmed", "waitlisted", "cancelled"] as const;

export const endOf = (asOf: string) => `${asOf} 23:59:59`;
export const round = (n: number, d = 0) => { const f = 10 ** d; return Math.round(n * f) / f; };
const safeDiv = (a: number, b: number) => (b ? a / b : null);

export function clampAsOf(ds: Dataset, asOf?: string): string {
  const lo = ds.event.history_start.slice(0, 10), hi = ds.event.history_end.slice(0, 10);
  if (!asOf || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return hi;
  return asOf < lo ? lo : asOf > hi ? hi : asOf;
}

export function targetAt(ds: Dataset, asOf: string): Target | null {
  const end = endOf(asOf);
  let t: Target | null = null;
  for (const x of ds.targets) if (x.effective_at <= end) t = x;
  return t;
}

function externalSet(ds: Dataset) {
  return new Set(ds.people.filter((p) => p.person_type === "external").map((p) => p.person_id));
}
function personIndex(ds: Dataset) {
  return new Map(ds.people.map((p) => [p.person_id, p]));
}

/** Latest registration status per registration_id at the end of asOf. */
export function latestStatus(ds: Dataset, asOf: string) {
  const end = endOf(asOf);
  const latest = new Map<string, { status: string; effective_at: string; person_id: string; campaign_id: string }>();
  for (const h of ds.history) {
    if (h.effective_at > end) continue;
    const cur = latest.get(h.registration_id);
    if (!cur || h.effective_at > cur.effective_at || (h.effective_at === cur.effective_at)) {
      latest.set(h.registration_id, { status: h.status, effective_at: h.effective_at, person_id: h.person_id, campaign_id: h.campaign_id });
    }
  }
  return latest;
}

/** Distinct external people with an admitted + verified check-in by the end of asOf. */
export function verifiedVisitors(ds: Dataset, asOf: string) {
  const end = endOf(asOf), ext = externalSet(ds);
  const firstAdmit = new Map<string, string>();
  for (const c of ds.checkins) {
    if (c.occurred_at > end || c.result !== "admitted" || c.verification !== "verified" || !ext.has(c.person_id)) continue;
    const cur = firstAdmit.get(c.person_id);
    if (!cur || c.occurred_at < cur) firstAdmit.set(c.person_id, c.occurred_at);
  }
  return firstAdmit; // person_id -> first verified admission time
}

export function kpis(ds: Dataset, asOfIn?: string) {
  const asOf = clampAsOf(ds, asOfIn);
  const end = endOf(asOf);
  const ext = externalSet(ds);
  const pidx = personIndex(ds);
  const target = targetAt(ds, asOf);

  const identified = ds.people.filter((p) => p.person_type === "external" && p.first_seen_at && p.first_seen_at <= end);
  const regs = ds.registrations.filter((r) => r.registered_at <= end && ext.has(r.person_id));
  const registeredPeople = new Set(regs.map((r) => r.person_id));
  const latest = latestStatus(ds, asOf);
  const status: Record<string, number> = { interested: 0, confirmed: 0, waitlisted: 0, cancelled: 0 };
  const confirmedPeople = new Set<string>();
  for (const r of regs) {
    const s = latest.get(r.registration_id)?.status;
    if (!s) continue;
    status[s] = (status[s] || 0) + 1;
    if (s === "confirmed") confirmedPeople.add(r.person_id);
  }
  const visitors = verifiedVisitors(ds, asOf);
  let attributed = 0, walkIns = 0, otherUnattributed = 0;
  for (const pid of visitors.keys()) {
    const p = pidx.get(pid);
    if (p?.first_campaign_id) attributed++;
    else if (p?.first_touch_source === "walk_in") walkIns++;
    else otherUnattributed++;
  }
  const confirmedAttended = [...confirmedPeople].filter((p) => visitors.has(p)).length;
  const spend = ds.daily.filter((d) => d.activity_date <= asOf).reduce((s, d) => s + d.marketing_spend_inr, 0);
  const eventStart = ds.event.event_starts_at.slice(0, 10);
  const eventEnd = ds.event.event_ends_at.slice(0, 10);
  const daysToEvent = Math.round((Date.parse(eventStart) - Date.parse(asOf)) / 86400000);

  return {
    asOf,
    eventPhase: asOf < eventStart ? "pre-event" : asOf <= eventEnd ? "during event" : "post-event",
    daysToEvent,
    target,
    identifiedExternalPeople: identified.length,
    registeredExternalPeople: registeredPeople.size,
    externalRegistrations: regs.length,
    registrationStatus: status,
    verifiedExternalVisitors: visitors.size,
    campaignAttributedVisitors: attributed,
    walkInVisitors: walkIns,
    otherUnattributedVisitors: otherUnattributed,
    confirmedRegistrants: confirmedPeople.size,
    confirmedWhoAttended: confirmedAttended,
    confirmedWithoutVerifiedAdmission: asOf >= eventStart ? confirmedPeople.size - confirmedAttended : null,
    showUpRateOfConfirmed: asOf >= eventEnd ? safeDiv(confirmedAttended, confirmedPeople.size) : null,
    netSpendInr: spend,
    budgetInr: target?.marketing_budget_inr ?? null,
    budgetUsedPct: target ? safeDiv(spend, target.marketing_budget_inr) : null,
    costPerRegisteredPersonInr: safeDiv(spend, registeredPeople.size),
    costPerVerifiedVisitorInr: visitors.size ? spend / visitors.size : null,
    progress: target ? {
      identifiedPct: safeDiv(identified.length, target.identified_external_people_goal),
      registrationPct: safeDiv(registeredPeople.size, target.registration_goal),
      visitorPct: safeDiv(visitors.size, target.unique_external_visitors_goal),
    } : null,
  };
}

export function campaignMetrics(ds: Dataset, asOfIn?: string) {
  const asOf = clampAsOf(ds, asOfIn);
  const end = endOf(asOf);
  const ext = externalSet(ds);
  const latest = latestStatus(ds, asOf);
  const visitors = verifiedVisitors(ds, asOf);
  const rows = ds.campaigns.map((c) => {
    const daily = ds.daily.filter((d) => d.campaign_id === c.campaign_id && d.activity_date <= asOf);
    const sum = (k: "impressions" | "clicks" | "reported_reach" | "landing_page_sessions" | "registration_starts" | "marketing_spend_inr") => daily.reduce((s, d) => s + d[k], 0);
    const identified = ds.people.filter((p) => p.person_type === "external" && p.first_campaign_id === c.campaign_id && p.first_seen_at <= end);
    const idSet = new Set(identified.map((p) => p.person_id));
    const regs = ds.registrations.filter((r) => r.campaign_id === c.campaign_id && r.registered_at <= end && ext.has(r.person_id));
    const regPeople = new Set(regs.map((r) => r.person_id));
    let confirmed = 0, cancelled = 0, waitlisted = 0;
    for (const r of regs) {
      const s = latest.get(r.registration_id)?.status;
      if (s === "confirmed") confirmed++; else if (s === "cancelled") cancelled++; else if (s === "waitlisted") waitlisted++;
    }
    const attendees = [...idSet].filter((p) => visitors.has(p)).length;
    const regAttended = [...regPeople].filter((p) => visitors.has(p)).length;
    const ints = ds.interactions.filter((i) => i.campaign_id === c.campaign_id && i.occurred_at <= end);
    const count = (t: string) => ints.filter((i) => i.event_type === t).length;
    const spend = sum("marketing_spend_inr");
    return {
      campaign_id: c.campaign_id, campaign_name: c.campaign_name, channel: c.channel, owner_name: c.owner_name,
      netSpendInr: spend,
      impressions: sum("impressions"), clicks: sum("clicks"), summedReportedReach: sum("reported_reach"),
      landingPageSessions: sum("landing_page_sessions"), anonymousRegistrationStarts: sum("registration_starts"),
      identifiedPeople: identified.length,
      registrations: regs.length, registeredPeople: regPeople.size,
      confirmed, cancelled, waitlisted,
      attributedVisitors: attendees,
      registrantsWhoAttended: regAttended,
      registrationToAttendanceRate: asOf >= ds.event.event_ends_at.slice(0, 10) ? safeDiv(regAttended, regPeople.size) : null,
      costPerRegistrationInr: safeDiv(spend, regs.length),
      costPerAttributedVisitorInr: attendees ? spend / attendees : null,
      emailsSent: count("nurture_email_sent"), emailsOpened: count("nurture_email_opened"), emailsClicked: count("nurture_email_clicked"),
      optOuts: count("opted_out"), pageVisits: count("page_visit"), brochureDownloads: count("brochure_download"),
    };
  });
  return { asOf, rows };
}

export function funnel(ds: Dataset, asOfIn?: string, campaignId?: string) {
  const asOf = clampAsOf(ds, asOfIn);
  const end = endOf(asOf);
  const people = ds.people.filter((p) => p.person_type === "external" && p.first_seen_at <= end && (!campaignId || p.first_campaign_id === campaignId));
  const ids = new Set(people.map((p) => p.person_id));
  const started = new Set(ds.interactions.filter((i) => i.event_type === "registration_start" && i.occurred_at <= end && ids.has(i.person_id)).map((i) => i.person_id));
  const regs = ds.registrations.filter((r) => r.registered_at <= end && ids.has(r.person_id));
  const registered = new Set(regs.map((r) => r.person_id));
  const latest = latestStatus(ds, asOf);
  const confirmed = new Set(regs.filter((r) => latest.get(r.registration_id)?.status === "confirmed").map((r) => r.person_id));
  const visitors = verifiedVisitors(ds, asOf);
  const attended = [...ids].filter((p) => visitors.has(p)).length;
  return {
    asOf, campaignId: campaignId || null,
    stages: [
      { stage: "Identified people", value: ids.size },
      { stage: "Started registration (identified)", value: started.size },
      { stage: "Registered", value: registered.size },
      { stage: "Currently confirmed", value: confirmed.size },
      { stage: "Verified attendance", value: attended },
    ],
  };
}

export function dailySeries(ds: Dataset, asOfIn?: string, campaignId?: string) {
  const asOf = clampAsOf(ds, asOfIn);
  const start = ds.event.history_start.slice(0, 10);
  const ext = externalSet(ds);
  const days: string[] = [];
  for (let t = Date.parse(start); ; t += 86400000) {
    const d = new Date(t).toISOString().slice(0, 10);
    if (d > asOf) break;
    days.push(d);
  }
  const spendBy = new Map<string, number>(), regBy = new Map<string, number>(), idBy = new Map<string, number>(), visBy = new Map<string, number>();
  for (const d of ds.daily) if (!campaignId || d.campaign_id === campaignId) spendBy.set(d.activity_date, (spendBy.get(d.activity_date) || 0) + d.marketing_spend_inr);
  for (const r of ds.registrations) if (ext.has(r.person_id) && (!campaignId || r.campaign_id === campaignId)) { const d = r.registered_at.slice(0, 10); regBy.set(d, (regBy.get(d) || 0) + 1); }
  for (const p of ds.people) if (p.person_type === "external" && (!campaignId || p.first_campaign_id === campaignId)) { const d = p.first_seen_at.slice(0, 10); idBy.set(d, (idBy.get(d) || 0) + 1); }
  const pidx = personIndex(ds);
  for (const [pid, t] of verifiedVisitors(ds, asOf)) if (!campaignId || pidx.get(pid)?.first_campaign_id === campaignId) { const d = t.slice(0, 10); visBy.set(d, (visBy.get(d) || 0) + 1); }
  let cs = 0, cr = 0, ci = 0, cv = 0;
  return days.map((d) => {
    const s = spendBy.get(d) || 0, r = regBy.get(d) || 0;
    cs += s; cr += r; ci += idBy.get(d) || 0; cv += visBy.get(d) || 0;
    const t = targetAt(ds, d);
    return { date: d, spend: s, registrations: r, cumSpend: cs, cumRegistrations: cr, cumIdentified: ci, cumVisitors: cv,
      budget: t?.marketing_budget_inr ?? null, registrationGoal: t?.registration_goal ?? null, visitorGoal: t?.unique_external_visitors_goal ?? null };
  });
}

export function dataQuality(ds: Dataset) {
  const ext = externalSet(ds);
  const pidx = personIndex(ds);
  const admitted = ds.checkins.filter((c) => c.result === "admitted" && c.verification === "verified");
  const perPerson = new Map<string, number>();
  for (const c of admitted) if (ext.has(c.person_id)) perPerson.set(c.person_id, (perPerson.get(c.person_id) || 0) + 1);
  return {
    duplicatesRemoved: ds.quality,
    checkinOutcomes: {
      deniedEvents: ds.checkins.filter((c) => c.result === "denied").length,
      pendingEvents: ds.checkins.filter((c) => c.result === "pending").length,
      unverifiedEvents: ds.checkins.filter((c) => c.verification === "unverified").length,
      nonExternalVerifiedAdmissions: admitted.filter((c) => !ext.has(c.person_id)).length,
      peopleAdmittedMoreThanOnce: [...perPerson.values()].filter((n) => n > 1).length,
    },
    personTypes: ds.people.reduce<Record<string, number>>((a, p) => { a[p.person_type] = (a[p.person_type] || 0) + 1; return a; }, {}),
    ledgerCredits: ds.daily.filter((d) => d.marketing_spend_inr < 0).length,
    namesSharedByMultiplePeople: (() => { const m = new Map<string, number>(); for (const p of ds.people) m.set(p.person_name, (m.get(p.person_name) || 0) + 1); return [...m.values()].filter((n) => n > 1).length; })(),
    unknownPersonRefs: ds.checkins.filter((c) => !pidx.has(c.person_id)).length,
  };
}

/** Questions this dataset cannot answer, with the reason and what would be needed. */
export const LIMITATIONS = [
  { topic: "College or city of attendees", reason: "The dataset has no college, city or demographic fields.", alternative: "Analyse by campaign, channel, owner, date or registration status instead.", toCollect: "Add college and city to future registration forms." },
  { topic: "Causal impact of a campaign", reason: "Attribution records each person's first campaign touch; it does not show what would have happened without the campaign.", alternative: "Rank campaigns by attributed visitors and cost per attributed visitor.", toCollect: "Run holdout or staggered-rollout experiments." },
  { topic: "Unique reach across campaigns", reason: "Platform reach is reported per day and per platform; people overlap, so sums are not unique people.", alternative: "Show campaign-level reach labelled as summed reported reach.", toCollect: "Use a consistent identity-based deduplication where platforms allow." },
  { topic: "Why people cancelled or did not attend", reason: "No reason codes are recorded.", alternative: "Count cancellations, waitlists and confirmed no-shows by campaign.", toCollect: "Ask a one-question reason on cancel and after the event." },
  { topic: "Sponsor activation impact", reason: "Sponsor data is not part of the attendee dataset.", alternative: "None within this dataset.", toCollect: "Join the sponsor dataset and test an activation with a comparison group." },
  { topic: "Exact incremental attendance from future plans", reason: "Forecasts use historical attributed rates, which are not proof of incremental lift.", alternative: "Use the Plan page's labelled assumptions and sensitivity.", toCollect: "Pilot gates at D−28 described on the Plan page." },
];
