import React, { useMemo } from "react";
import { Siren, AlertTriangle } from "lucide-react";

export default function DashboardPage({ snapshot, config, onNavigate }) {
  const { resources, patients, alerts, pendingReallocations } = snapshot;
  const stats = useMemo(() => {
    const beds = resources.filter((r) => r.type !== "OT");
    const occupied = beds.filter((r) => r.status === "OCCUPIED").length;
    const icu = resources.filter((r) => r.type === "ICU_BED");
    const icuOcc = icu.filter((r) => r.status === "OCCUPIED").length;
    const ot = resources.filter((r) => r.type === "OT");
    const otBusy = ot.filter((r) => r.status === "OCCUPIED").length;
    const iso = resources.filter((r) => r.is_isolation_capable);
    const isoFree = iso.filter((r) => r.status === "FREE").length;
    const waiting = Object.values(patients).filter((p) => p.status === "WAITING");
    const critical = waiting.filter((p) => p.clinicalClass === 1).length;
    return { totalBeds: beds.length, occupied, available: beds.length - occupied, icuTotal: icu.length, icuOcc, icuFree: icu.length - icuOcc, otTotal: ot.length, otBusy, isoTotal: iso.length, isoFree, waiting: waiting.length, critical };
  }, [resources, patients]);
  const occPct = stats.totalBeds ? Math.round((stats.occupied / stats.totalBeds) * 100) : 0;

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-sub">Current hospital status at a glance.</p>
      <div className="grid-2">
        <div className="panel">
          <h3 className="panel-title">Hospital Status</h3>
          <div className="mini-grid">
            <div className="mini-stat">Total Beds<div className="val">{stats.totalBeds}</div></div>
            <div className="mini-stat">Occupied<div className="val">{stats.occupied} ({occPct}%)</div></div>
            <div className="mini-stat">Available<div className="val">{stats.available}</div></div>
            <div className="mini-stat">Patients Waiting<div className="val">{stats.waiting}</div></div>
          </div>
        </div>
        <div className="panel">
          <h3 className="panel-title">ICU</h3>
          <div className="mini-grid">
            <div className="mini-stat">ICU Beds<div className="val">{stats.icuTotal}</div></div>
            <div className="mini-stat">ICU Available<div className="val" style={{ color: stats.icuFree === 0 ? "#e11d48" : undefined }}>{stats.icuFree}</div></div>
            <div className="mini-stat">Critical Patients Waiting<div className="val" style={{ color: stats.critical > 0 ? "#e11d48" : undefined }}>{stats.critical}</div></div>
            <div className="mini-stat">ICU Occupancy<div className="val">{stats.icuTotal ? Math.round((stats.icuOcc / stats.icuTotal) * 100) : 0}%</div></div>
          </div>
        </div>
        <div className="panel span-2">
          <h3 className="panel-title">Floors</h3>
          <div className="stack">
            {config.floors.map((f) => {
              const beds = resources.filter((r) => r.floor === f.code && r.type !== "OT");
              const occ = beds.filter((r) => r.status === "OCCUPIED").length;
              const pct = beds.length ? Math.round((occ / beds.length) * 100) : 0;
              return (
                <div className="floor-row" key={f.code}>
                  <div className="row between"><span style={{ fontWeight: 700, fontSize: 12.5 }}>{f.name} &middot; <span className="muted">{f.careLevel}</span></span><span className="mono" style={{ fontSize: 12 }}>{occ}/{beds.length}</span></div>
                  <div className="progress-track"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="panel">
          <h3 className="panel-title">Resources</h3>
          <div className="mini-grid">
            <div className="mini-stat">OT Available<div className="val">{stats.otTotal - stats.otBusy}/{stats.otTotal}</div></div>
            <div className="mini-stat">Isolation Rooms Free<div className="val">{stats.isoFree}/{stats.isoTotal}</div></div>
          </div>
        </div>
        <div className="panel">
          <div className="row between" style={{ marginBottom: 10 }}>
            <h3 className="panel-title" style={{ margin: 0 }}>Alerts</h3>
            <button className="btn" onClick={() => onNavigate("alerts")}>View all</button>
          </div>
          {alerts.length === 0 && pendingReallocations.length === 0 ? (
            <div className="empty-note" style={{ padding: 0 }}>No active alerts — all clear.</div>
          ) : (
            <div className="stack" style={{ gap: 6 }}>
              {pendingReallocations.length > 0 && <div className="alert-item"><Siren size={13} style={{ flexShrink: 0, marginTop: 1 }} />{pendingReallocations.length} reallocation recommendation{pendingReallocations.length > 1 ? "s" : ""} awaiting review</div>}
              {alerts.slice(0, 3).map((a) => <div className="alert-item" key={a.id}><AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />{a.message}</div>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
