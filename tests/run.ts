// Run with: npm test   (uses a temporary local store; no database or API key needed)
import fs from "fs";
import assert from "assert/strict";
import * as XLSX from "xlsx";
process.env.STORE_FILE = "/tmp/crowdspark-test-store.json";
try { fs.unlinkSync(process.env.STORE_FILE); } catch {}

import { parseWorkbook } from "../lib/dataset";
import { kpis, campaignMetrics, funnel, targetAt } from "../lib/metrics";
import { forecast, DEFAULT_PLAN_INPUTS, STRETCH_OVERRIDES } from "../lib/plan";
import { runTool, chat, safeCalc, type Proposal } from "../lib/copilot";

let passed = 0;
async function t(name: string, fn: () => unknown | Promise<unknown>) {
  try { await fn(); passed++; console.log("  ✓", name); }
  catch (e) { console.error("  ✗", name, "\n   ", (e as Error).message); process.exitCode = 1; }
}

const buf = fs.readFileSync("data/Attendee_Dataset.xlsx");
const ds = parseWorkbook(buf);

(async () => {
  console.log("Metric engine");
  await t("final snapshot matches hand-checked totals", () => {
    const k = kpis(ds, "2025-04-20");
    assert.equal(k.identifiedExternalPeople, 3625); assert.equal(k.registeredExternalPeople, 2800);
    assert.equal(k.verifiedExternalVisitors, 2050); assert.equal(k.campaignAttributedVisitors, 1925); assert.equal(k.walkInVisitors, 125);
    assert.equal(k.confirmedRegistrants, 2500); assert.equal(k.confirmedWithoutVerifiedAdmission, 575);
    assert.equal(k.netSpendInr, 274000); assert.equal(k.target?.unique_external_visitors_goal, 2200);
  });
  await t("duplicates removed (2 daily, 4 history, 20 check-ins)", () => {
    const q = Object.fromEntries(ds.quality.map((x) => [x.sheet, x.duplicateIdsRemoved]));
    assert.equal(q["Daily Marketing"], 2); assert.equal(q["Registration History"], 4); assert.equal(q["Check-ins"], 20);
  });
  await t("no later outcome leaks into an earlier snapshot", () => {
    const k = kpis(ds, "2025-04-11");
    assert.equal(k.verifiedExternalVisitors, 0); assert.equal(k.confirmedWithoutVerifiedAdmission, null);
    assert.equal(kpis(ds, "2025-04-05").registeredExternalPeople, 2581);
    assert.equal(kpis(ds, "2025-04-12").verifiedExternalVisitors, 1430);
  });
  await t("targets switch on 15 March", () => {
    assert.equal(targetAt(ds, "2025-03-14")?.target_version, "Attendee launch plan");
    assert.equal(targetAt(ds, "2025-03-15")?.target_version, "Attendee revised plan");
  });
  await t("per-campaign attributed visitors sum to 1,925", () => {
    const rows = campaignMetrics(ds, "2025-04-20").rows;
    assert.equal(rows.reduce((a, r) => a + r.attributedVisitors, 0), 1925);
    assert.equal(rows.find((r) => r.campaign_name === "Paid Social")!.attributedVisitors, 340);
  });
  await t("funnel is monotonic", () => { const s = funnel(ds).stages.map((x) => x.value); for (let i = 1; i < s.length; i++) assert.ok(s[i] <= s[i - 1]); });

  console.log("Changed data recalculates");
  await t("removing Paid Social check-ins and adding ₹10,000 spend changes every dependent number", () => {
    const wb = XLSX.read(buf, { type: "buffer" });
    const ck = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["Check-ins"], { raw: true });
    wb.Sheets["Check-ins"] = XLSX.utils.json_to_sheet(ck.filter((r) => r.campaign_id !== "C02"));
    const dm = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["Daily Marketing"], { raw: true });
    const first = dm.find((r) => r.campaign_id === "C04")!; dm.push({ ...first, activity_id: "AD-TEST-1", marketing_spend_inr: 10000 });
    wb.Sheets["Daily Marketing"] = XLSX.utils.json_to_sheet(dm);
    const ds2 = parseWorkbook(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
    const k2 = kpis(ds2, "2025-04-20");
    assert.equal(k2.netSpendInr, 284000);
    assert.equal(campaignMetrics(ds2).rows.find((r) => r.campaign_id === "C02")!.attributedVisitors, 0);
    assert.ok(k2.verifiedExternalVisitors < 2050);
  });

  console.log("Plan model");
  await t("base 2,488 / stretch 3,133 / break-even −27% / 30 ambassadors → 2,144", () => {
    assert.equal(Math.round(forecast(DEFAULT_PLAN_INPUTS).totalAttendees), 2488);
    assert.equal(Math.round(forecast({ ...DEFAULT_PLAN_INPUTS, ...STRETCH_OVERRIDES }).totalAttendees), 3133);
    assert.equal(Math.round(forecast(DEFAULT_PLAN_INPUTS).breakEven!.shortfallPct * 100), 27);
    assert.equal(Math.round(forecast({ ...DEFAULT_PLAN_INPUTS, activeAmbassadors: 30 }).totalAttendees), 2144);
  });

  console.log("Copilot tools");
  const ctx = { asOf: "2025-04-20", scenario: "original" as const };
  await t("every read tool returns data with a source", async () => {
    for (const n of ["get_overview", "get_campaign_metrics", "get_funnel", "get_trend", "get_targets", "get_data_quality", "get_data_limitations", "get_plan_forecast", "list_tasks", "list_campaign_plans"]) {
      const r = await runTool(n, {}, ctx, []); assert.ok(r, n);
    }
  });
  await t("campaign lookup accepts names and rejects unknown ones", async () => {
    const r = (await runTool("get_campaign_metrics", { campaign: "paid social" }, ctx, [])) as { rows: { campaign_id: string }[] };
    assert.equal(r.rows.length, 1); assert.equal(r.rows[0].campaign_id, "C02");
    await assert.rejects(runTool("get_campaign_metrics", { campaign: "TikTok" }, ctx, []));
  });
  await t("what-if does not save; proposals are collected, not executed", async () => {
    const w = (await runTool("get_plan_forecast", { overrides: { activeAmbassadors: 30 } }, ctx, [])) as { forecast: { totalAttendees: number } };
    assert.equal(w.forecast.totalAttendees, 2144);
    const again = (await runTool("get_plan_forecast", {}, ctx, [])) as { forecast: { totalAttendees: number } };
    assert.equal(again.forecast.totalAttendees, 2488);
    const props: Proposal[] = [];
    await runTool("propose_task", { title: "Recruit 20 ambassadors", owner: "Ambassador coordinator", due_date: "D−21", reason: "30/50 active" }, ctx, props);
    assert.equal(props.length, 1); assert.equal(props[0].type, "create_task");
    const tasks = (await runTool("list_tasks", {}, ctx, [])) as { tasks: unknown[] };
    assert.equal(tasks.tasks.length, 6); // seed only: nothing was created
  });
  await t("calculator is exact and refuses code", () => {
    assert.equal(safeCalc("(93000+59000)/274000*100"), 55.474453); assert.equal(safeCalc("2,050 - 1,925"), 125);
    assert.throws(() => safeCalc("process.exit()")); assert.throws(() => safeCalc("1;alert(1)"));
  });

  console.log("Gemini loop (scripted fake model)");
  await t("calls tools, echoes model parts, returns final text and proposals", async () => {
    const calls: unknown[] = [];
    const script = [
      { candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "get_campaign_metrics", args: { campaign: "Paid Social" } }, thoughtSignature: "sig-1" }] } }] },
      { candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "propose_task", args: { title: "Cap paid social", owner: "Growth lead", reason: "₹274 per visitor" } } }] } }] },
      { candidates: [{ content: { role: "model", parts: [{ text: "Paid Social: 340 attributed visitors at ₹274 each. I've proposed a task below.\nSource: original data at 2025-04-20 · get_campaign_metrics" }] } }] },
    ];
    const fake = (async (_url: string, init: RequestInit) => { calls.push(JSON.parse(String(init.body))); return new Response(JSON.stringify(script[calls.length - 1]), { status: 200 }); }) as unknown as typeof fetch;
    const out = await chat([{ role: "user", text: "How did paid social do? Create a task to cap it." }], ctx, { apiKey: "test", fetchImpl: fake });
    assert.match(out.reply, /340/); assert.equal(out.proposals.length, 1); assert.deepEqual(out.trace.map((x) => x.name), ["get_campaign_metrics", "propose_task"]);
    const second = calls[1] as { contents: { role: string; parts: { thoughtSignature?: string; functionResponse?: { response: { result: { rows: { attributedVisitors: number }[] } } } }[] }[] };
    assert.equal(second.contents[1].parts[0].thoughtSignature, "sig-1");
    assert.equal(second.contents[2].parts[0].functionResponse!.response.result.rows[0].attributedVisitors, 340);
  });
  await t("rate limit and missing key give friendly messages", async () => {
    const r429 = (async () => new Response("quota", { status: 429 })) as unknown as typeof fetch;
    assert.match((await chat([{ role: "user", text: "hi" }], ctx, { apiKey: "x", fetchImpl: r429 })).reply, /rate limit/i);
    assert.match((await chat([{ role: "user", text: "hi" }], ctx, { apiKey: "" })).reply, /GEMINI_API_KEY/);
  });

  console.log(`\n${passed} checks passed${process.exitCode ? ", some FAILED" : ""}.`);
})();
