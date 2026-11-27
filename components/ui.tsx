"use client";
export const fmt = (n: number | null | undefined, d = 0) => (n === null || n === undefined || !Number.isFinite(n) ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d }));
export const inr = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? "—" : `₹${Math.round(n).toLocaleString("en-IN")}`);
export const pct = (n: number | null | undefined, d = 0) => (n === null || n === undefined || !Number.isFinite(n) ? "—" : `${(n * 100).toFixed(d)}%`);

export function Kpi({ label, value, of, progress, note }: { label: string; value: string; of?: string; progress?: number | null; note?: string }) {
  return (
    <div className="card kpi">
      <div className="label">{label}</div>
      <div className="val">{value}</div>
      {of && <div className="of">{of}</div>}
      {progress !== undefined && progress !== null && <div className="bar"><div style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%`, background: progress >= 1 ? "var(--good)" : "var(--acc)" }} /></div>}
      {note && <div className="note" style={{ marginTop: 8 }}>{note}</div>}
    </div>
  );
}

export async function api<T = unknown>(url: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...opts, headers: { "Content-Type": "application/json", ...(opts?.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || `Request failed (${r.status})`);
  return j as T;
}
