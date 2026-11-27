// Parses the attendee workbook into typed, de-duplicated tables.
// All timestamps are kept as IST wall-clock strings "YYYY-MM-DD HH:MM:SS",
// which sort correctly as text and never shift with the server's time zone.
import * as XLSX from "xlsx";

export type Ts = string; // "YYYY-MM-DD HH:MM:SS" (IST)

export interface EventInfo { event_name: string; history_start: Ts; history_end: Ts; event_starts_at: Ts; event_ends_at: Ts; timezone: string; currency: string; fictional: boolean; }
export interface Target { effective_at: Ts; identified_external_people_goal: number; registration_goal: number; unique_external_visitors_goal: number; marketing_budget_inr: number; target_version: string; }
export interface Campaign { campaign_id: string; campaign_name: string; channel: string; target_audience: string; objective: string; owner_id: string; owner_name: string; created_at: Ts; planned_start_at: Ts; planned_end_at: Ts; }
export interface DailyRow { activity_id: string; campaign_id: string; campaign_name: string; activity_date: string; impressions: number; clicks: number; reported_reach: number; landing_page_sessions: number; registration_starts: number; marketing_spend_inr: number; platform: string; }
export interface Person { person_id: string; person_name: string; person_type: string; first_seen_at: Ts; first_touch_source: string; first_campaign_id: string; first_campaign_name: string; }
export interface Interaction { interaction_id: string; person_id: string; campaign_id: string; occurred_at: Ts; event_type: string; }
export interface Registration { registration_id: string; person_id: string; campaign_id: string; registered_at: Ts; }
export interface RegHistory { history_id: string; registration_id: string; person_id: string; campaign_id: string; effective_at: Ts; status: string; }
export interface CheckIn { event_id: string; person_id: string; registration_id: string; campaign_id: string; occurred_at: Ts; result: string; verification: string; source: string; }

export interface Dataset {
  label: string;
  event: EventInfo;
  targets: Target[];
  campaigns: Campaign[];
  daily: DailyRow[];
  people: Person[];
  interactions: Interaction[];
  registrations: Registration[];
  history: RegHistory[];
  checkins: CheckIn[];
  quality: { sheet: string; rows: number; duplicateIdsRemoved: number }[];
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Convert any cell value (Excel serial, Date, or ISO-ish text) to an IST wall-clock string. */
export function toTs(v: unknown): Ts {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return "";
    const secs = Math.round(d.S + (d.u || 0));
    return `${d.y}-${pad(d.m)}-${pad(d.d)} ${pad(d.H)}:${pad(d.M)}:${pad(Math.min(secs, 59))}`;
  }
  if (v instanceof Date) {
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())} ${pad(v.getHours())}:${pad(v.getMinutes())}:${pad(v.getSeconds())}`;
  }
  // Text such as 2025-04-12T10:00:00+05:30 or 2025-04-12
  const s = String(v).trim().replace("T", " ").replace(/([+-]\d\d:?\d\d|Z)$/, "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s} 00:00:00`;
  const m = s.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?/);
  return m ? `${m[1]} ${m[2]}:${m[3]}:${m[4] ?? "00"}` : s;
}
const toDate = (v: unknown) => toTs(v).slice(0, 10);
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

function sheet(wb: XLSX.WorkBook, names: string[]): Record<string, unknown>[] {
  const name = wb.SheetNames.find((n) => names.some((x) => n.trim().toLowerCase() === x.toLowerCase()));
  if (!name) throw new Error(`Missing sheet: ${names[0]}`);
  return XLSX.utils.sheet_to_json(wb.Sheets[name], { raw: true, defval: null });
}

function dedupe<T>(rows: T[], key: keyof T, sheetName: string, quality: Dataset["quality"]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    const k = String(r[key] ?? "");
    if (k && seen.has(k)) continue;
    if (k) seen.add(k);
    out.push(r);
  }
  quality.push({ sheet: sheetName, rows: rows.length, duplicateIdsRemoved: rows.length - out.length });
  return out;
}

export function parseWorkbook(buf: Buffer | ArrayBuffer | Uint8Array, label = "Original dataset"): Dataset {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false });
  const quality: Dataset["quality"] = [];

  const ev = sheet(wb, ["Event"])[0] || {};
  const event: EventInfo = {
    event_name: str(ev.event_name), history_start: toTs(ev.history_start), history_end: toTs(ev.history_end),
    event_starts_at: toTs(ev.event_starts_at), event_ends_at: toTs(ev.event_ends_at),
    timezone: str(ev.timezone) || "Asia/Kolkata", currency: str(ev.currency) || "INR", fictional: Boolean(ev.fictional),
  };
  const targets = sheet(wb, ["Targets"]).map((r) => ({
    effective_at: toTs(r.effective_at), identified_external_people_goal: num(r.identified_external_people_goal),
    registration_goal: num(r.registration_goal), unique_external_visitors_goal: num(r.unique_external_visitors_goal),
    marketing_budget_inr: num(r.marketing_budget_inr), target_version: str(r.target_version),
  })).sort((a, b) => a.effective_at.localeCompare(b.effective_at));
  const campaigns = dedupe(sheet(wb, ["Campaigns"]).map((r) => ({
    campaign_id: str(r.campaign_id), campaign_name: str(r.campaign_name), channel: str(r.channel),
    target_audience: str(r.target_audience), objective: str(r.objective), owner_id: str(r.owner_id), owner_name: str(r.owner_name),
    created_at: toTs(r.created_at), planned_start_at: toTs(r.planned_start_at), planned_end_at: toTs(r.planned_end_at),
  })), "campaign_id", "Campaigns", quality);
  const daily = dedupe(sheet(wb, ["Daily Marketing", "campaign_daily"]).map((r) => ({
    activity_id: str(r.activity_id), campaign_id: str(r.campaign_id), campaign_name: str(r.campaign_name), activity_date: toDate(r.activity_date),
    impressions: num(r.impressions), clicks: num(r.clicks), reported_reach: num(r.reported_reach), landing_page_sessions: num(r.landing_page_sessions),
    registration_starts: num(r.registration_starts), marketing_spend_inr: num(r.marketing_spend_inr), platform: str(r.platform),
  })), "activity_id", "Daily Marketing", quality);
  const people = dedupe(sheet(wb, ["People"]).map((r) => ({
    person_id: str(r.person_id), person_name: str(r.person_name), person_type: str(r.person_type).toLowerCase(),
    first_seen_at: toTs(r.first_seen_at), first_touch_source: str(r.first_touch_source),
    first_campaign_id: str(r.first_campaign_id), first_campaign_name: str(r.first_campaign_name),
  })), "person_id", "People", quality);
  const interactions = dedupe(sheet(wb, ["Interest and Engagement", "lead_interactions"]).map((r) => ({
    interaction_id: str(r.interaction_id), person_id: str(r.person_id), campaign_id: str(r.campaign_id),
    occurred_at: toTs(r.occurred_at), event_type: str(r.event_type),
  })), "interaction_id", "Interest and Engagement", quality);
  const registrations = dedupe(sheet(wb, ["Registrations"]).map((r) => ({
    registration_id: str(r.registration_id), person_id: str(r.person_id), campaign_id: str(r.campaign_id), registered_at: toTs(r.registered_at),
  })), "registration_id", "Registrations", quality);
  const history = dedupe(sheet(wb, ["Registration History", "registration_history"]).map((r) => ({
    history_id: str(r.history_id), registration_id: str(r.registration_id), person_id: str(r.person_id), campaign_id: str(r.campaign_id),
    effective_at: toTs(r.effective_at), status: str(r.status).toLowerCase(),
  })), "history_id", "Registration History", quality);
  const checkins = dedupe(sheet(wb, ["Check-ins", "checkins"]).map((r) => ({
    event_id: str(r.event_id), person_id: str(r.person_id), registration_id: str(r.registration_id), campaign_id: str(r.campaign_id),
    occurred_at: toTs(r.occurred_at), result: str(r.result).toLowerCase(), verification: str(r.verification).toLowerCase(), source: str(r.source),
  })), "event_id", "Check-ins", quality);

  return { label, event, targets, campaigns, daily, people, interactions, registrations, history, checkins, quality };
}
