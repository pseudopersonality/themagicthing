// Persistence for everything the team edits: tasks, campaign plans, plan inputs
// and an optional uploaded working dataset. Uses Postgres when DATABASE_URL is
// set (Neon / Supabase / Vercel Postgres); otherwise a local JSON file for dev.
import fs from "fs";
import postgres from "postgres";
import { DEFAULT_PLAN_INPUTS, type PlanInputs } from "./plan";

export type TaskStatus = "todo" | "in_progress" | "done";
export interface Task { id: number; title: string; owner: string; due_date: string | null; status: TaskStatus; campaign_id: string | null; source: "manual" | "copilot"; notes: string; created_at: string; updated_at: string; }
export interface CampaignPlan { campaign_id: string; name: string; channel: string; owner: string; status: "scale" | "maintain" | "pilot" | "stopped" | "plan_line"; planned_budget_inr: number; notes: string; is_custom: boolean; updated_at: string; }
export interface ActivityItem { id: number; at: string; kind: string; summary: string; }
export interface WorkingDataset { name: string; uploaded_at: string; base64: string; }

interface FileShape { tasks: Task[]; plans: CampaignPlan[]; planInputs: PlanInputs; dataset: WorkingDataset | null; activity: ActivityItem[]; seq: number; }

const now = () => new Date().toISOString();

// ---------- seed content (the plan from the strategy deck) ----------
export const SEED_PLANS: Omit<CampaignPlan, "updated_at">[] = [
  { campaign_id: "C04", name: "College Partnerships", channel: "college_partnerships", owner: "Partnership volunteers (2)", status: "scale", planned_budget_inr: 105000, notes: "30 societies × 42 registrations; pilot 5 colleges from D−42.", is_custom: false },
  { campaign_id: "C01", name: "Campus Ambassadors", channel: "ambassadors", owner: "Ambassador coordinator", status: "scale", planned_budget_inr: 90000, notes: "50 active × 20 registrations; rewards tied to verified attendance.", is_custom: false },
  { campaign_id: "C05", name: "Student Referrals", channel: "referrals", owner: "Referral owner", status: "scale", planned_budget_inr: 25000, notes: "Launch once a seed cohort exists; 0.14 referrals per registrant.", is_custom: false },
  { campaign_id: "C02", name: "Paid Social", channel: "paid_social", owner: "Growth lead", status: "pilot", planned_budget_inr: 10000, notes: "₹3k first; pause above 2× historical cost per registration.", is_custom: false },
  { campaign_id: "C06", name: "Organic Search", channel: "organic_search", owner: "Data / ops owner", status: "maintain", planned_budget_inr: 5000, notes: "Maintain pages; retention is an assumption.", is_custom: false },
  { campaign_id: "C07", name: "Community Groups", channel: "community", owner: "Partnership volunteers (2)", status: "maintain", planned_budget_inr: 5000, notes: "Maintain relationships; retention is an assumption.", is_custom: false },
  { campaign_id: "C03", name: "Creator Partners", channel: "creators", owner: "Growth lead", status: "stopped", planned_budget_inr: 0, notes: "Dropped: weakest historical cost per attributed visitor.", is_custom: false },
  { campaign_id: "P-ARR", name: "Arrival support (reminders, passes, travel)", channel: "crm", owner: "CRM owner", status: "plan_line", planned_budget_inr: 20000, notes: "Upside 0–93 attendees, excluded from targets.", is_custom: false },
  { campaign_id: "P-TOOLS", name: "Tools & data operations", channel: "ops", owner: "Data / ops owner", status: "plan_line", planned_budget_inr: 5000, notes: "", is_custom: false },
];
export const RESERVE_INR = 35000;

const SEED_TASKS: Omit<Task, "id" | "created_at" | "updated_at">[] = [
  { title: "Pilot 5 college societies with event-specific invitations", owner: "Partnership volunteers (2)", due_date: "D−42", status: "todo", campaign_id: "C04", source: "manual", notes: "Gate: ≥10 valid registrations per college in first 7 days." },
  { title: "Recruit and onboard first 25 campus ambassadors", owner: "Ambassador coordinator", due_date: "D−28", status: "todo", campaign_id: "C01", source: "manual", notes: "Gate: ≥5 valid registrations per ambassador in 7 days." },
  { title: "Launch ₹3k paid social creative test", owner: "Growth lead", due_date: "D−35", status: "todo", campaign_id: "C02", source: "manual", notes: "Pause above ₹274 per registration." },
  { title: "Turn on referral codes once 500 registrants exist", owner: "Referral owner", due_date: "D−28", status: "todo", campaign_id: "C05", source: "manual", notes: "Base calibration 0.14 referrals per registrant." },
  { title: "D−28 gate review: release ₹35k reserve to expansion or paid fallback", owner: "Growth lead", due_date: "D−28", status: "todo", campaign_id: null, source: "manual", notes: "" },
  { title: "Build reminder + pass + travel message flow", owner: "CRM owner", due_date: "D−35", status: "todo", campaign_id: "P-ARR", source: "manual", notes: "Collect cancellation and no-show reasons." },
];

function seedFile(): FileShape {
  let seq = 0;
  const t = now();
  return {
    tasks: SEED_TASKS.map((x) => ({ ...x, id: ++seq, created_at: t, updated_at: t })),
    plans: SEED_PLANS.map((p) => ({ ...p, updated_at: t })),
    planInputs: { ...DEFAULT_PLAN_INPUTS },
    dataset: null,
    activity: [],
    seq,
  };
}

// ---------- backend selection ----------
const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
export const storageMode = DB_URL ? "postgres" : "local-file";

// ---------- local file backend ----------
const FILE = process.env.STORE_FILE || "/tmp/crowdspark-store.json";
function readFile(): FileShape {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { const s = seedFile(); writeFile(s); return s; }
}
function writeFile(s: FileShape) { fs.writeFileSync(FILE, JSON.stringify(s)); }

// ---------- postgres backend ----------
let sqlClient: ReturnType<typeof postgres> | null = null;
let ready: Promise<void> | null = null;
function sql() {
  if (!sqlClient) {
    sqlClient = postgres(DB_URL, { ssl: /localhost|127\.0\.0\.1/.test(DB_URL) ? false : "require", max: 1, prepare: false, idle_timeout: 20 });
  }
  return sqlClient;
}
async function init() {
  if (!ready) ready = (async () => {
    const q = sql();
    await q`CREATE TABLE IF NOT EXISTS cs_tasks (id SERIAL PRIMARY KEY, title TEXT NOT NULL, owner TEXT NOT NULL DEFAULT '', due_date TEXT, status TEXT NOT NULL DEFAULT 'todo', campaign_id TEXT, source TEXT NOT NULL DEFAULT 'manual', notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`;
    await q`CREATE TABLE IF NOT EXISTS cs_plans (campaign_id TEXT PRIMARY KEY, name TEXT NOT NULL, channel TEXT NOT NULL DEFAULT '', owner TEXT NOT NULL DEFAULT '', status TEXT NOT NULL, planned_budget_inr INTEGER NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT '', is_custom BOOLEAN NOT NULL DEFAULT false, updated_at TEXT NOT NULL)`;
    await q`CREATE TABLE IF NOT EXISTS cs_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)`;
    await q`CREATE TABLE IF NOT EXISTS cs_activity (id SERIAL PRIMARY KEY, at TEXT NOT NULL, kind TEXT NOT NULL, summary TEXT NOT NULL)`;
    const [{ n }] = await q`SELECT count(*)::int AS n FROM cs_kv WHERE key = 'seeded'`;
    if (!n) {
      const s = seedFile();
      for (const t of s.tasks) await q`INSERT INTO cs_tasks (title, owner, due_date, status, campaign_id, source, notes, created_at, updated_at) VALUES (${t.title}, ${t.owner}, ${t.due_date}, ${t.status}, ${t.campaign_id}, ${t.source}, ${t.notes}, ${t.created_at}, ${t.updated_at})`;
      for (const p of s.plans) await q`INSERT INTO cs_plans (campaign_id, name, channel, owner, status, planned_budget_inr, notes, is_custom, updated_at) VALUES (${p.campaign_id}, ${p.name}, ${p.channel}, ${p.owner}, ${p.status}, ${p.planned_budget_inr}, ${p.notes}, ${p.is_custom}, ${p.updated_at}) ON CONFLICT DO NOTHING`;
      await q`INSERT INTO cs_kv (key, value) VALUES ('plan_inputs', ${JSON.stringify(s.planInputs)}) ON CONFLICT (key) DO NOTHING`;
      await q`INSERT INTO cs_kv (key, value) VALUES ('seeded', '1')`;
    }
  })();
  return ready;
}

async function logActivity(kind: string, summary: string) {
  if (storageMode === "postgres") { await init(); await sql()`INSERT INTO cs_activity (at, kind, summary) VALUES (${now()}, ${kind}, ${summary})`; return; }
  const s = readFile(); s.activity.unshift({ id: ++s.seq, at: now(), kind, summary }); s.activity = s.activity.slice(0, 100); writeFile(s);
}

// ---------- public API ----------
export async function listActivity(): Promise<ActivityItem[]> {
  if (storageMode === "postgres") { await init(); return (await sql()`SELECT * FROM cs_activity ORDER BY id DESC LIMIT 50`) as unknown as ActivityItem[]; }
  return readFile().activity;
}

export async function listTasks(): Promise<Task[]> {
  if (storageMode === "postgres") { await init(); return (await sql()`SELECT * FROM cs_tasks ORDER BY id`) as unknown as Task[]; }
  return readFile().tasks;
}
export async function createTask(t: Partial<Task> & { title: string }): Promise<Task> {
  const row = { title: t.title.slice(0, 300), owner: (t.owner || "Unassigned").slice(0, 120), due_date: t.due_date || null, status: (t.status || "todo") as TaskStatus, campaign_id: t.campaign_id || null, source: (t.source || "manual") as Task["source"], notes: (t.notes || "").slice(0, 2000), created_at: now(), updated_at: now() };
  let out: Task;
  if (storageMode === "postgres") {
    await init();
    [out] = (await sql()`INSERT INTO cs_tasks (title, owner, due_date, status, campaign_id, source, notes, created_at, updated_at) VALUES (${row.title}, ${row.owner}, ${row.due_date}, ${row.status}, ${row.campaign_id}, ${row.source}, ${row.notes}, ${row.created_at}, ${row.updated_at}) RETURNING *`) as unknown as Task[];
  } else {
    const s = readFile(); out = { ...row, id: ++s.seq }; s.tasks.push(out); writeFile(s);
  }
  await logActivity("task_created", `${row.source === "copilot" ? "Copilot task" : "Task"} created: ${row.title} (${row.owner}${row.due_date ? `, due ${row.due_date}` : ""})`);
  return out;
}
export async function updateTask(id: number, patch: Partial<Task>): Promise<Task | null> {
  const allowed = ["title", "owner", "due_date", "status", "campaign_id", "notes"] as const;
  const clean: Partial<Task> = {};
  for (const k of allowed) if (k in patch) (clean as Record<string, unknown>)[k] = patch[k];
  let out: Task | null = null;
  if (storageMode === "postgres") {
    await init();
    const cur = ((await sql()`SELECT * FROM cs_tasks WHERE id = ${id}`) as unknown as Task[])[0];
    if (!cur) return null;
    const m = { ...cur, ...clean, updated_at: now() };
    [out] = (await sql()`UPDATE cs_tasks SET title=${m.title}, owner=${m.owner}, due_date=${m.due_date}, status=${m.status}, campaign_id=${m.campaign_id}, notes=${m.notes}, updated_at=${m.updated_at} WHERE id=${id} RETURNING *`) as unknown as Task[];
  } else {
    const s = readFile(); const i = s.tasks.findIndex((t) => t.id === id); if (i < 0) return null;
    s.tasks[i] = out = { ...s.tasks[i], ...clean, updated_at: now() }; writeFile(s);
  }
  await logActivity("task_updated", `Task updated: ${out!.title} → ${out!.status}`);
  return out;
}
export async function deleteTask(id: number): Promise<boolean> {
  if (storageMode === "postgres") { await init(); const r = await sql()`DELETE FROM cs_tasks WHERE id=${id}`; await logActivity("task_deleted", `Task #${id} deleted`); return r.count > 0; }
  const s = readFile(); const n = s.tasks.length; s.tasks = s.tasks.filter((t) => t.id !== id); writeFile(s); await logActivity("task_deleted", `Task #${id} deleted`); return s.tasks.length < n;
}

export async function listPlans(): Promise<CampaignPlan[]> {
  if (storageMode === "postgres") { await init(); return (await sql()`SELECT * FROM cs_plans ORDER BY planned_budget_inr DESC, name`) as unknown as CampaignPlan[]; }
  return [...readFile().plans].sort((a, b) => b.planned_budget_inr - a.planned_budget_inr);
}
export async function upsertPlan(p: Partial<CampaignPlan> & { campaign_id?: string; name?: string }): Promise<CampaignPlan> {
  const all = await listPlans();
  const id = p.campaign_id || `X-${Date.now().toString(36)}`;
  const cur = all.find((x) => x.campaign_id === id);
  const m: CampaignPlan = {
    campaign_id: id, name: (p.name ?? cur?.name ?? "New campaign").slice(0, 120), channel: (p.channel ?? cur?.channel ?? "").slice(0, 60),
    owner: (p.owner ?? cur?.owner ?? "Unassigned").slice(0, 120), status: (p.status ?? cur?.status ?? "pilot") as CampaignPlan["status"],
    planned_budget_inr: Math.max(0, Math.round(Number(p.planned_budget_inr ?? cur?.planned_budget_inr ?? 0)) || 0),
    notes: (p.notes ?? cur?.notes ?? "").slice(0, 2000), is_custom: cur ? cur.is_custom : true, updated_at: now(),
  };
  if (storageMode === "postgres") {
    await init();
    await sql()`INSERT INTO cs_plans (campaign_id, name, channel, owner, status, planned_budget_inr, notes, is_custom, updated_at) VALUES (${m.campaign_id}, ${m.name}, ${m.channel}, ${m.owner}, ${m.status}, ${m.planned_budget_inr}, ${m.notes}, ${m.is_custom}, ${m.updated_at})
      ON CONFLICT (campaign_id) DO UPDATE SET name=EXCLUDED.name, channel=EXCLUDED.channel, owner=EXCLUDED.owner, status=EXCLUDED.status, planned_budget_inr=EXCLUDED.planned_budget_inr, notes=EXCLUDED.notes, updated_at=EXCLUDED.updated_at`;
  } else {
    const s = readFile(); const i = s.plans.findIndex((x) => x.campaign_id === id); if (i >= 0) s.plans[i] = m; else s.plans.push(m); writeFile(s);
  }
  await logActivity("campaign_saved", `${cur ? "Updated" : "Added"} ${m.name}: ${m.status}, ₹${m.planned_budget_inr.toLocaleString("en-IN")}`);
  return m;
}
export async function deletePlan(id: string): Promise<boolean> {
  const all = await listPlans(); const cur = all.find((x) => x.campaign_id === id);
  if (!cur || !cur.is_custom) return false; // historical campaigns cannot be deleted, only stopped
  if (storageMode === "postgres") { await init(); await sql()`DELETE FROM cs_plans WHERE campaign_id=${id}`; }
  else { const s = readFile(); s.plans = s.plans.filter((x) => x.campaign_id !== id); writeFile(s); }
  await logActivity("campaign_deleted", `Removed ${cur.name}`);
  return true;
}

export async function getPlanInputs(): Promise<PlanInputs> {
  if (storageMode === "postgres") {
    await init();
    const r = (await sql()`SELECT value FROM cs_kv WHERE key='plan_inputs'`) as unknown as { value: string }[];
    return { ...DEFAULT_PLAN_INPUTS, ...(r[0] ? JSON.parse(r[0].value) : {}) };
  }
  return { ...DEFAULT_PLAN_INPUTS, ...readFile().planInputs };
}
export async function setPlanInputs(patch: Partial<PlanInputs>): Promise<PlanInputs> {
  const cur = await getPlanInputs();
  const next: PlanInputs = { ...cur };
  for (const k of Object.keys(DEFAULT_PLAN_INPUTS) as (keyof PlanInputs)[]) {
    if (k in patch) { const v = Number(patch[k]); if (Number.isFinite(v) && v >= 0) next[k] = v; }
  }
  if (storageMode === "postgres") { await init(); await sql()`INSERT INTO cs_kv (key, value) VALUES ('plan_inputs', ${JSON.stringify(next)}) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`; }
  else { const s = readFile(); s.planInputs = next; writeFile(s); }
  const changed = Object.keys(patch).filter((k) => (cur as unknown as Record<string, number>)[k] !== (next as unknown as Record<string, number>)[k]);
  if (changed.length) await logActivity("plan_updated", `Plan inputs changed: ${changed.map((k) => `${k} ${(cur as unknown as Record<string, number>)[k]} → ${(next as unknown as Record<string, number>)[k]}`).join(", ")}`);
  return next;
}
export async function resetPlanInputs(): Promise<PlanInputs> { return setPlanInputs({ ...DEFAULT_PLAN_INPUTS }); }

export async function getWorkingDataset(): Promise<WorkingDataset | null> {
  if (storageMode === "postgres") {
    await init();
    const r = (await sql()`SELECT value FROM cs_kv WHERE key='working_dataset'`) as unknown as { value: string }[];
    return r[0] ? JSON.parse(r[0].value) : null;
  }
  return readFile().dataset;
}
export async function setWorkingDataset(d: WorkingDataset | null) {
  if (storageMode === "postgres") {
    await init();
    if (d) await sql()`INSERT INTO cs_kv (key, value) VALUES ('working_dataset', ${JSON.stringify(d)}) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`;
    else await sql()`DELETE FROM cs_kv WHERE key='working_dataset'`;
  } else { const s = readFile(); s.dataset = d; writeFile(s); }
  await logActivity("dataset", d ? `Working dataset uploaded: ${d.name}` : "Working dataset reset to the original");
}
