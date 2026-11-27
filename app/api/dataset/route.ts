import { getWorkingDataset, setWorkingDataset } from "@/lib/store";
import { parseWorkbook } from "@/lib/dataset";
import { kpis } from "@/lib/metrics";
import { json, bad } from "@/lib/http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET() { const w = await getWorkingDataset(); return json(w ? { name: w.name, uploaded_at: w.uploaded_at } : null); }
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") return bad("Attach an .xlsx workbook with the same sheets as the original.");
  if (file.size > 4_400_000) return bad("File too large (max 4.4 MB). Save it from Excel as a normal .xlsx; avoid adding images.");
  const buf = Buffer.from(await file.arrayBuffer());
  let summary;
  try { const ds = parseWorkbook(buf, file.name); summary = kpis(ds); }
  catch (e) { return bad(`Could not read this workbook: ${(e as Error).message}. It must contain the same sheets as the original.`); }
  await setWorkingDataset({ name: file.name, uploaded_at: new Date().toISOString(), base64: buf.toString("base64") });
  return json({ ok: true, name: file.name, check: { verifiedExternalVisitors: summary.verifiedExternalVisitors, registeredExternalPeople: summary.registeredExternalPeople, netSpendInr: summary.netSpendInr } });
}
export async function DELETE() { await setWorkingDataset(null); return json({ ok: true }); }
