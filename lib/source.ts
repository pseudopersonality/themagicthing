// Chooses which dataset to read: the bundled ORIGINAL (read-only, always preserved)
// or the WORKING copy (an uploaded edited workbook). Parsed results are cached.
import fs from "fs";
import path from "path";
import { parseWorkbook, type Dataset } from "./dataset";
import { getWorkingDataset } from "./store";

export type Scenario = "original" | "working";

const g = globalThis as unknown as { __csOriginal?: Dataset; __csWorking?: { key: string; ds: Dataset } };

export function originalDataset(): Dataset {
  if (!g.__csOriginal) {
    const file = path.join(process.cwd(), "data", "Attendee_Dataset.xlsx");
    g.__csOriginal = parseWorkbook(fs.readFileSync(file), "Original dataset (Attendee_Dataset.xlsx)");
  }
  return g.__csOriginal;
}

export async function getDataset(scenario: Scenario = "working"): Promise<{ ds: Dataset; scenario: Scenario; label: string }> {
  if (scenario === "original") { const ds = originalDataset(); return { ds, scenario, label: ds.label }; }
  const w = await getWorkingDataset();
  if (!w) { const ds = originalDataset(); return { ds, scenario: "working", label: "Working data = original (no edited upload yet)" }; }
  const key = `${w.name}|${w.uploaded_at}`;
  if (!g.__csWorking || g.__csWorking.key !== key) {
    g.__csWorking = { key, ds: parseWorkbook(Buffer.from(w.base64, "base64"), `Working dataset: ${w.name} (uploaded ${w.uploaded_at.slice(0, 16).replace("T", " ")} UTC)`) };
  }
  return { ds: g.__csWorking.ds, scenario, label: g.__csWorking.ds.label };
}

export function parseScenario(v: string | null | undefined): Scenario {
  return v === "original" ? "original" : "working";
}
