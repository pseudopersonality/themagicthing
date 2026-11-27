"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Copilot from "./Copilot";

type Scenario = "working" | "original";
interface Ctx {
  scenario: Scenario; setScenario: (s: Scenario) => void;
  asOf: string; setAsOf: (d: string) => void;
  version: number; bump: () => void;
  meta: Meta | null;
}
export interface Meta { storageMode: string; copilotConfigured: boolean; model: string; event: { event_name: string; history_start: string; history_end: string; event_starts_at: string; event_ends_at: string }; workingDataset: { name: string; uploaded_at: string } | null; }

const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => { const c = useContext(AppCtx); if (!c) throw new Error("no ctx"); return c; };

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/tasks", label: "Tasks" },
  { href: "/plan", label: "Plan & forecast" },
  { href: "/data", label: "Data & rules" },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [scenario, setScenario] = useState<Scenario>("working");
  const [asOf, setAsOf] = useState("2025-04-20");
  const [version, setVersion] = useState(0);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [cpOpen, setCpOpen] = useState(true);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => { fetch("/api/meta").then((r) => r.json()).then(setMeta).catch(() => {}); }, [version]);
  useEffect(() => {
    const h = () => bump();
    window.addEventListener("cs:changed", h);
    return () => window.removeEventListener("cs:changed", h);
  }, [bump]);

  return (
    <AppCtx.Provider value={{ scenario, setScenario, asOf, setAsOf, version, bump, meta }}>
      <header className="top">
        <div className="brand"><span style={{ color: "var(--ink)" }}>Crowd<span style={{ color: "var(--acc)" }}>Spark</span></span><span style={{ color: "var(--muted)", fontWeight: 500, fontSize: 13 }}>Growth Center</span></div>
        <nav className="nav">
          {LINKS.map((l) => <Link key={l.href} href={l.href} className={path === l.href ? "on" : ""}>{l.label}</Link>)}
        </nav>
        <div className="spacer" />
        <div className="seg" title="Original = the supplied workbook, never modified. Working = your uploaded edited copy (same as original until you upload).">
          <button className={scenario === "working" ? "on" : ""} onClick={() => setScenario("working")}>Working data</button>
          <button className={scenario === "original" ? "on" : ""} onClick={() => setScenario("original")}>Original</button>
        </div>
        <button className="btn" onClick={() => setCpOpen((o) => !o)}>{cpOpen ? "Hide copilot" : "Ask copilot"}</button>
      </header>
      <div className="layout">
        <main className="main">
          {meta && meta.storageMode !== "postgres" && (
            <div className="banner">Running without a database: edits are saved to a temporary file and may reset. Set <b>DATABASE_URL</b> to persist them.</div>
          )}
          {children}
        </main>
        {cpOpen && <Copilot />}
      </div>
    </AppCtx.Provider>
  );
}

export function notifyChanged() { window.dispatchEvent(new Event("cs:changed")); }
