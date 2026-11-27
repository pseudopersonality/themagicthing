import { getPlanInputs, setPlanInputs, resetPlanInputs } from "@/lib/store";
import { forecast, DEFAULT_PLAN_INPUTS, STRETCH_OVERRIDES, INPUT_META } from "@/lib/plan";
import { json, body } from "@/lib/http";
export const dynamic = "force-dynamic";
async function payload(inputs?: Awaited<ReturnType<typeof getPlanInputs>>) {
  const i = inputs || (await getPlanInputs());
  return { inputs: i, meta: INPUT_META, defaults: DEFAULT_PLAN_INPUTS, current: forecast(i),
    reference: { base: forecast(DEFAULT_PLAN_INPUTS), stretch: forecast({ ...DEFAULT_PLAN_INPUTS, ...STRETCH_OVERRIDES }) } };
}
export async function GET() { return json(await payload()); }
export async function PUT(req: Request) { return json(await payload(await setPlanInputs(await body(req)))); }
export async function DELETE() { return json(await payload(await resetPlanInputs())); }
