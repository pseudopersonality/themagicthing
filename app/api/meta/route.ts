import { storageMode, getWorkingDataset } from "@/lib/store";
import { originalDataset } from "@/lib/source";
import { json } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET() {
  const ds = originalDataset();
  const w = await getWorkingDataset();
  return json({ storageMode, copilotConfigured: Boolean(process.env.GEMINI_API_KEY), model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
    event: ds.event, workingDataset: w ? { name: w.name, uploaded_at: w.uploaded_at } : null });
}
