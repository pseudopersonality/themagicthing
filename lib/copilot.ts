// Copilot: Gemini function-calling over the same metric engine the dashboard uses.
// The model never sees raw numbers it did not fetch through a tool, and it can only
// PROPOSE changes; the user confirms them in the UI before anything is saved.
import { getDataset, parseScenario, type Scenario } from "./source";
import { kpis, campaignMetrics, funnel, dailySeries, dataQuality, clampAsOf, LIMITATIONS } from "./metrics";
import { insights } from "./insights";
import { listTasks, listPlans, getPlanInputs } from "./store";
import { forecast, DEFAULT_PLAN_INPUTS, STRETCH_OVERRIDES, INPUT_META, type PlanInputs } from "./plan";

export interface Proposal { type: "create_task" | "update_plan_inputs" | "update_campaign_plan"; summary: string; payload: Record<string, unknown>; reason?: string; }
export interface ToolTrace { name: string; args: Record<string, unknown>; ok: boolean; }

type Json = Record<string, unknown>;
const S = (description: string, properties: Json = {}, required: string[] = []) => {
  const o: Json = { type: "object", properties };
  if (description) o.description = description;
  if (required.length) o.required = required;
  return o;
};
const str = (d: string) => ({ type: "string", description: d });
const numb = (d: string) => ({ type: "number", description: d });
const asOfP = str("Snapshot date YYYY-MM-DD (end of day IST). Omit to use the date selected in the dashboard.");
const scenP = { type: "string", enum: ["working", "original"], description: "Dataset: 'working' (default, includes uploaded edits) or 'original' (supplied workbook)." };

export const TOOL_DECLARATIONS = [
  { name: "get_overview", description: "Headline KPIs at a date: identified, registered and verified external people vs the targets in force, registration status counts, net spend vs budget, costs, show-up of confirmed registrants, plus rule-based insights.", parameters: S("", { as_of: asOfP, scenario: scenP }) },
  { name: "get_campaign_metrics", description: "Per-campaign metrics at a date: spend, impressions, clicks, summed reported reach (overlapping, not unique), identified people, registrations, confirmed, cancelled, waitlisted, first-touch attributed verified visitors, registration-to-attendance rate, cost per registration, cost per attributed visitor, email and opt-out counts.", parameters: S("", { as_of: asOfP, scenario: scenP, campaign: str("Optional campaign name or id to filter, e.g. 'Paid Social' or 'C02'.") }) },
  { name: "get_funnel", description: "Person-level funnel at a date: identified → started registration → registered → currently confirmed → verified attendance. Optional campaign filter (first-touch).", parameters: S("", { as_of: asOfP, scenario: scenP, campaign: str("Optional campaign name or id.") }) },
  { name: "get_trend", description: "Weekly trend up to a date: spend, new registrations, cumulative registrations / identified / verified visitors, with budget and goals in force. Optional campaign filter.", parameters: S("", { as_of: asOfP, scenario: scenP, campaign: str("Optional campaign name or id.") }) },
  { name: "get_targets", description: "All target versions with their effective dates, and which applies at a date.", parameters: S("", { as_of: asOfP, scenario: scenP }) },
  { name: "get_data_quality", description: "Duplicates removed, denied/pending/unverified check-ins, internal/staff/test admissions excluded, repeat admissions, ledger credits, shared names. Use to explain how numbers were cleaned.", parameters: S("", { scenario: scenP }) },
  { name: "get_data_limitations", description: "Questions this dataset cannot answer (college/city, causal impact, unique reach, no-show reasons, sponsor impact, incremental lift), with what CAN be calculated instead and what to collect." },
  { name: "get_plan_forecast", description: "The next-festival plan: saved capacity inputs (colleges, ambassadors, productivity, referral yield, paid budget, show-up rates), the forecast by channel, base/stretch references, break-even and sensitivity. Pass 'overrides' to run a what-if WITHOUT saving.", parameters: S("", { overrides: S("Optional what-if values, keys as in the inputs, e.g. {\"activeAmbassadors\": 30}.", Object.fromEntries(Object.keys(DEFAULT_PLAN_INPUTS).map((k) => [k, numb(INPUT_META[k as keyof PlanInputs].label)]))) }) },
  { name: "list_tasks", description: "Saved tasks with owner, due date, status, linked campaign and whether the copilot created them.", parameters: S("", { status: { type: "string", enum: ["todo", "in_progress", "done"], description: "Optional status filter." } }) },
  { name: "list_campaign_plans", description: "Saved plan per campaign/plan line: status (scale, maintain, pilot, stopped), owner, planned budget, notes; plus the ₹3L ceiling and ₹35k reserve." },
  { name: "calculate", description: "Evaluate an arithmetic expression exactly (numbers, + - * / ( ) and %). Use for every derived number instead of mental arithmetic.", parameters: S("", { expression: str("e.g. '(93000+59000)/274000*100'") }, ["expression"]) },
  { name: "propose_task", description: "Propose a task for the user to confirm. Nothing is saved until they click Confirm.", parameters: S("", { title: str("Action-oriented title."), owner: str("Owner name or role."), due_date: str("Due date YYYY-MM-DD or relative like 'D−21'."), campaign_id: str("Optional related campaign id, e.g. C01."), notes: str("Success criteria / context."), reason: str("Data-based reason, with the numbers.") }, ["title", "owner", "reason"]) },
  { name: "propose_plan_change", description: "Propose saving new plan input values (the user confirms). Use after a what-if when the user wants it saved.", parameters: S("", { changes: S("Input keys and new values.", Object.fromEntries(Object.keys(DEFAULT_PLAN_INPUTS).map((k) => [k, numb(INPUT_META[k as keyof PlanInputs].label)]))), reason: str("Why.") }, ["changes", "reason"]) },
  { name: "propose_campaign_update", description: "Propose changing a campaign's plan status, owner, planned budget or notes (the user confirms).", parameters: S("", { campaign_id: str("Campaign or plan-line id, e.g. C02 or P-ARR."), status: { type: "string", enum: ["scale", "maintain", "pilot", "stopped", "plan_line"] }, planned_budget_inr: numb("New planned budget in INR."), owner: str("New owner."), notes: str("Notes."), reason: str("Why, with numbers.") }, ["campaign_id", "reason"]) },
];

function resolveCampaign(ds: Awaited<ReturnType<typeof getDataset>>["ds"], q?: unknown): string | undefined {
  if (!q) return undefined;
  const s = String(q).trim().toLowerCase();
  const c = ds.campaigns.find((x) => x.campaign_id.toLowerCase() === s || x.campaign_name.toLowerCase() === s)
    || ds.campaigns.find((x) => x.campaign_name.toLowerCase().includes(s) || s.includes(x.campaign_name.toLowerCase()));
  if (!c) throw new Error(`Unknown campaign '${q}'. Known: ${ds.campaigns.map((x) => `${x.campaign_name} (${x.campaign_id})`).join(", ")}`);
  return c.campaign_id;
}

export function safeCalc(expr: string): number {
  const e = String(expr).replace(/,/g, "").replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-");
  if (!/^[\d\s+\-*/().%]+$/.test(e)) throw new Error("Only numbers and + - * / ( ) % are allowed.");
  const js = e.replace(/(\d+(?:\.\d+)?)\s*%/g, "($1/100)");
  // eslint-disable-next-line no-new-func
  const v = Function(`"use strict"; return (${js});`)();
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error("Not a finite number.");
  return Math.round(v * 1e6) / 1e6;
}

const r2 = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);

export async function runTool(name: string, args: Json, ctx: { asOf: string; scenario: Scenario }, proposals: Proposal[]): Promise<unknown> {
  const scenario = parseScenario((args.scenario as string) || ctx.scenario);
  const needData = !["calculate", "propose_task", "propose_plan_change", "propose_campaign_update", "get_data_limitations", "list_tasks", "list_campaign_plans", "get_plan_forecast"].includes(name);
  const src = needData ? await getDataset(scenario) : null;
  const ds = src?.ds;
  const asOf = ds ? clampAsOf(ds, (args.as_of as string) || ctx.asOf) : ctx.asOf;
  const source = src ? { dataset: src.label, scenario: src.scenario, asOf } : undefined;
  switch (name) {
    case "get_overview": return { source, kpis: kpis(ds!, asOf), insights: insights(ds!, asOf) };
    case "get_campaign_metrics": {
      const id = resolveCampaign(src!.ds, args.campaign);
      const rows = campaignMetrics(ds!, asOf).rows.filter((r) => !id || r.campaign_id === id).map((r) => ({ ...r, registrationToAttendanceRate: r2(r.registrationToAttendanceRate), costPerRegistrationInr: r2(r.costPerRegistrationInr), costPerAttributedVisitorInr: r2(r.costPerAttributedVisitorInr) }));
      return { source, attribution: "first-touch person-level (fixed first campaign); association, not causal lift", rows };
    }
    case "get_funnel": return { source, ...funnel(ds!, asOf, resolveCampaign(src!.ds, args.campaign)) };
    case "get_trend": {
      const id = resolveCampaign(src!.ds, args.campaign);
      const s = dailySeries(ds!, asOf, id);
      const weeks: Json[] = [];
      for (let i = 0; i < s.length; i += 7) {
        const w = s.slice(i, i + 7), last = w[w.length - 1];
        weeks.push({ weekEnding: last.date, spend: w.reduce((a, x) => a + x.spend, 0), newRegistrations: w.reduce((a, x) => a + x.registrations, 0), cumRegistrations: last.cumRegistrations, cumIdentified: last.cumIdentified, cumVerifiedVisitors: last.cumVisitors, cumSpend: last.cumSpend, budget: last.budget, registrationGoal: last.registrationGoal });
      }
      return { source, campaign: id || "all", weeks };
    }
    case "get_targets": return { source, versions: ds!.targets, inForce: ds!.targets.filter((t) => t.effective_at <= `${asOf} 23:59:59`).pop() || null };
    case "get_data_quality": return { source, ...dataQuality(ds!) };
    case "get_data_limitations": return { limitations: LIMITATIONS };
    case "get_plan_forecast": {
      const saved = await getPlanInputs();
      const ov = (args.overrides || {}) as Partial<PlanInputs>;
      const inputs = { ...saved, ...Object.fromEntries(Object.entries(ov).filter(([k, v]) => k in DEFAULT_PLAN_INPUTS && Number.isFinite(Number(v))).map(([k, v]) => [k, Number(v)])) } as PlanInputs;
      const f = forecast(inputs);
      return { source: { plan: Object.keys(ov).length ? "saved plan + unsaved what-if overrides" : "saved plan inputs" }, inputs, overridesApplied: ov, forecast: { ...f, channels: f.channels.map((c) => ({ ...c, registrations: Math.round(c.registrations), attendees: Math.round(c.attendees) })), totalRegistrations: Math.round(f.totalRegistrations), totalAttendees: Math.round(f.totalAttendees) },
        references: { base: Math.round(forecast(DEFAULT_PLAN_INPUTS).totalAttendees), stretch: Math.round(forecast({ ...DEFAULT_PLAN_INPUTS, ...STRETCH_OVERRIDES }).totalAttendees), headlineTargets: { base: 2500, stretch: 3100 } }, basis: INPUT_META };
    }
    case "list_tasks": { const t = await listTasks(); return { tasks: args.status ? t.filter((x) => x.status === args.status) : t }; }
    case "list_campaign_plans": { const p = await listPlans(); return { plans: p, plannedTotalInr: p.reduce((a, x) => a + x.planned_budget_inr, 0), reserveInr: 35000, ceilingInr: 300000 }; }
    case "calculate": return { expression: args.expression, result: safeCalc(String(args.expression)) };
    case "propose_task": {
      const p: Proposal = { type: "create_task", summary: `Create task: ${args.title} (owner ${args.owner}${args.due_date ? `, due ${args.due_date}` : ""})`, payload: { title: args.title, owner: args.owner, due_date: args.due_date || null, campaign_id: args.campaign_id || null, notes: args.notes || "", source: "copilot" }, reason: String(args.reason || "") };
      proposals.push(p); return { status: "proposed_awaiting_user_confirmation", proposal: p.summary };
    }
    case "propose_plan_change": {
      const ch = Object.fromEntries(Object.entries((args.changes || {}) as Json).filter(([k, v]) => k in DEFAULT_PLAN_INPUTS && Number.isFinite(Number(v))).map(([k, v]) => [k, Number(v)]));
      if (!Object.keys(ch).length) throw new Error("No valid plan inputs in 'changes'.");
      const p: Proposal = { type: "update_plan_inputs", summary: `Save plan inputs: ${Object.entries(ch).map(([k, v]) => `${INPUT_META[k as keyof PlanInputs].label} = ${v}`).join(", ")}`, payload: ch, reason: String(args.reason || "") };
      proposals.push(p); return { status: "proposed_awaiting_user_confirmation", proposal: p.summary };
    }
    case "propose_campaign_update": {
      const plans = await listPlans();
      const cur = plans.find((x) => x.campaign_id === args.campaign_id);
      if (!cur) throw new Error(`Unknown plan id '${args.campaign_id}'. Known: ${plans.map((x) => `${x.name} (${x.campaign_id})`).join(", ")}`);
      const payload: Json = { campaign_id: cur.campaign_id };
      for (const k of ["status", "planned_budget_inr", "owner", "notes"]) if (args[k] !== undefined && args[k] !== null && args[k] !== "") payload[k] = args[k];
      const p: Proposal = { type: "update_campaign_plan", summary: `Update ${cur.name}: ${Object.entries(payload).filter(([k]) => k !== "campaign_id").map(([k, v]) => `${k} → ${v}`).join(", ")}`, payload, reason: String(args.reason || "") };
      proposals.push(p); return { status: "proposed_awaiting_user_confirmation", proposal: p.summary };
    }
    default: throw new Error(`Unknown tool ${name}`);
  }
}

export function systemPrompt(ctx: { asOf: string; scenario: Scenario }) {
  return `You are the CrowdSpark Growth Copilot for a festival growth team. You answer questions about the attendee-acquisition dataset (fictional CampusFest 2025, event 12–13 April 2025, records 15 Jan–20 Apr 2025) and the next-festival plan, and you help turn insights into tasks.

The user is currently viewing: snapshot date ${ctx.asOf} (end of day IST), dataset '${ctx.scenario}'. Use these unless they ask otherwise.

RULES
1. Every number must come from a tool result in THIS conversation. Never estimate, recall or invent figures. If a needed number is not available from the tools, say so.
2. Use the calculate tool for any arithmetic beyond reading a value (sums, differences, shares, ratios, percentages).
3. Definitions: attendance = distinct EXTERNAL people with an admitted AND verified check-in (2 days, repeat entries counted once). Registration status = latest version at the date. Targets = the version in force at the date. Campaign attribution = each person's fixed first campaign (first touch): it shows association, NOT causal impact. Summed platform reach overlaps and is not unique people. Spend is net INR (credits negative).
4. If a question cannot be answered from the data (college/city, causal impact, unique reach across campaigns, reasons for cancellations/no-shows, sponsor impact, guaranteed incremental lift), say plainly that this dataset cannot establish it, give the closest thing you CAN calculate (and calculate it), and say what data would be needed. Call get_data_limitations if unsure.
5. Actions: you cannot save anything yourself. When the user wants a task, plan change or campaign change, call the matching propose_* tool; then tell them to confirm it below. Never claim something was created or saved.
6. What-if questions about the next festival: call get_plan_forecast with overrides; say clearly it was not saved.
7. Be concise and direct: lead with the answer, then 2–5 short supporting points. Use Indian number formatting (e.g., 2,74,000 or ₹2.74 lakh is fine). Plain text, no markdown tables, no headings; short dash lists are fine.
8. End every analytical answer with one line starting "Source:" naming the dataset (original/working), the snapshot date, and the tools used, e.g. "Source: working data at 2025-04-20 · get_campaign_metrics, calculate".
9. If the user asks about something unrelated to this festival growth work, briefly say that's outside what you can help with here.`;
}

// ---------------- Gemini REST loop ----------------
type Part = { text?: string; functionCall?: { name: string; args?: Json; id?: string }; functionResponse?: { name: string; response: Json; id?: string }; thoughtSignature?: string; thought?: boolean };
type Content = { role: "user" | "model"; parts: Part[] };

export interface ChatTurn { role: "user" | "assistant"; text: string; }

export async function chat(history: ChatTurn[], ctx: { asOf: string; scenario: Scenario }, opts: { apiKey?: string; model?: string; fetchImpl?: typeof fetch } = {}) {
  const apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY;
  const model = opts.model ?? process.env.GEMINI_MODEL ?? "gemini-3.8-flash";
  if (!apiKey) return { reply: "The copilot isn’t configured yet: add a GEMINI_API_KEY environment variable (free from Google AI Studio) and redeploy.", trace: [] as ToolTrace[], proposals: [] as Proposal[], error: "not_configured" };
  const f = opts.fetchImpl ?? fetch;
  const contents: Content[] = history.slice(-12).map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.text.slice(0, 4000) }] }));
  const trace: ToolTrace[] = []; const proposals: Proposal[] = [];
  for (let step = 0; step < 8; step++) {
    const res = await f(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt(ctx) }] }, contents, tools: [{ functionDeclarations: TOOL_DECLARATIONS }], generationConfig: { temperature: 0.2 } }),
    });
    if (!res.ok) {
      const txt = await res.text();
      const reason = res.status === 429 ? "The free Gemini quota is busy (rate limit). Wait a minute and try again." : res.status === 400 || res.status === 404 ? `Gemini rejected the request (${res.status}). Check GEMINI_MODEL (currently '${model}') and the API key.` : `Gemini error ${res.status}.`;
      return { reply: reason, trace, proposals, error: txt.slice(0, 500) };
    }
    const j = await res.json();
    const cand = j.candidates?.[0];
    const parts: Part[] = cand?.content?.parts || [];
    if (!parts.length) return { reply: cand?.finishReason === "SAFETY" ? "I can’t answer that one." : "I didn’t get an answer back. Please try rephrasing.", trace, proposals };
    contents.push({ role: "model", parts }); // echo back verbatim (keeps thought signatures)
    const calls = parts.filter((p) => p.functionCall);
    if (!calls.length) {
      const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("").trim();
      return { reply: text || "(no answer)", trace, proposals };
    }
    const responses: Part[] = [];
    for (const p of calls) {
      const { name, args = {}, id } = p.functionCall!;
      try {
        const result = await runTool(name, args, ctx, proposals);
        trace.push({ name, args, ok: true });
        responses.push({ functionResponse: { name, response: { result: result as Json }, ...(id ? { id } : {}) } });
      } catch (e) {
        trace.push({ name, args, ok: false });
        responses.push({ functionResponse: { name, response: { error: (e as Error).message }, ...(id ? { id } : {}) } });
      }
    }
    contents.push({ role: "user", parts: responses });
  }
  return { reply: "That needed more steps than I allow. Please ask a narrower question.", trace, proposals };
}
