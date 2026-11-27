import fs from "fs"; import path from "path";
export const dynamic = "force-dynamic";
export async function GET() {
  const buf = fs.readFileSync(path.join(process.cwd(), "data", "Attendee_Dataset.xlsx"));
  return new Response(buf, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="Attendee_Dataset.xlsx"' } });
}
