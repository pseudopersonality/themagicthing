"use client";
import { useEffect, useState } from "react";
import { useApp, notifyChanged } from "@/components/Shell";
import { api } from "@/components/ui";

interface Task { id: number; title: string; owner: string; due_date: string | null; status: "todo" | "in_progress" | "done"; campaign_id: string | null; source: string; notes: string; created_at: string; }
const COLS = [{ k: "todo", l: "To do" }, { k: "in_progress", l: "In progress" }, { k: "done", l: "Done" }] as const;

export default function Tasks() {
  const { version } = useApp();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [plans, setPlans] = useState<{ campaign_id: string; name: string }[]>([]);
  const [owner, setOwner] = useState("");
  const [nt, setNt] = useState({ title: "", owner: "", due_date: "", campaign_id: "", notes: "" });
  const [err, setErr] = useState("");

  useEffect(() => {
    api<Task[]>("/api/tasks").then(setTasks).catch((e) => setErr(e.message));
    api<{ plans: { campaign_id: string; name: string }[] }>("/api/plans").then((p) => setPlans(p.plans)).catch(() => {});
  }, [version]);

  const owners = [...new Set(tasks.map((t) => t.owner))].sort();
  const name = (id: string | null) => plans.find((p) => p.campaign_id === id)?.name || id || "";
  async function move(t: Task, status: Task["status"]) { await api(`/api/tasks/${t.id}`, { method: "PATCH", body: JSON.stringify({ status }) }); notifyChanged(); }
  async function del(t: Task) { if (confirm(`Delete “${t.title}”?`)) { await api(`/api/tasks/${t.id}`, { method: "DELETE" }); notifyChanged(); } }
  async function add() {
    if (!nt.title.trim()) { setErr("A task needs a title."); return; }
    try { await api("/api/tasks", { method: "POST", body: JSON.stringify(nt) }); setNt({ title: "", owner: "", due_date: "", campaign_id: "", notes: "" }); setErr(""); notifyChanged(); }
    catch (e) { setErr((e as Error).message); }
  }

  return (
    <>
      <div className="pagehead">
        <div><h1>Tasks</h1><div className="sub">Owned actions with deadlines. Tasks the copilot proposes appear here once you confirm them.</div></div>
        <div className="toolbar"><select className="in" value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">All owners</option>{owners.map((o) => <option key={o}>{o}</option>)}</select></div>
      </div>
      {err && <div className="banner">{err}</div>}
      <div className="card" style={{ marginBottom: 14 }}>
        <h3>New task</h3>
        <div className="row">
          <input className="in" style={{ minWidth: 320, flex: 1 }} placeholder="What needs to happen?" value={nt.title} onChange={(e) => setNt({ ...nt, title: e.target.value })} />
          <input className="in" placeholder="Owner" value={nt.owner} onChange={(e) => setNt({ ...nt, owner: e.target.value })} />
          <input className="in" style={{ width: 130 }} placeholder="Due (date or D−21)" value={nt.due_date} onChange={(e) => setNt({ ...nt, due_date: e.target.value })} />
          <select className="in" value={nt.campaign_id} onChange={(e) => setNt({ ...nt, campaign_id: e.target.value })}><option value="">No campaign</option>{plans.map((p) => <option key={p.campaign_id} value={p.campaign_id}>{p.name}</option>)}</select>
          <input className="in" style={{ minWidth: 220 }} placeholder="Success criteria" value={nt.notes} onChange={(e) => setNt({ ...nt, notes: e.target.value })} />
          <button className="btn primary" onClick={add}>Add task</button>
        </div>
      </div>
      <div className="kanban">
        {COLS.map((c) => {
          const list = tasks.filter((t) => t.status === c.k && (!owner || t.owner === owner));
          return (
            <div key={c.k} className="card">
              <h3>{c.l} · {list.length}</h3>
              {list.length === 0 && <div className="empty">Nothing here.</div>}
              {list.map((t) => (
                <div key={t.id} className="tcard">
                  <div className="tt">{t.title}</div>
                  <div className="row note" style={{ marginTop: 6 }}>
                    <span>{t.owner}</span>{t.due_date && <span>· due {t.due_date}</span>}{t.campaign_id && <span>· {name(t.campaign_id)}</span>}
                    {t.source === "copilot" && <span className="pill info">from copilot</span>}
                  </div>
                  {t.notes && <div className="note" style={{ marginTop: 6 }}>{t.notes}</div>}
                  <div className="row" style={{ marginTop: 8 }}>
                    {COLS.filter((x) => x.k !== t.status).map((x) => <button key={x.k} className="btn" onClick={() => move(t, x.k)}>→ {x.l}</button>)}
                    <button className="btn ghost danger" onClick={() => del(t)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}
