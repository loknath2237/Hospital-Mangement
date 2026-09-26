import React from "react";
import { AlertTriangle, ArrowRightLeft, X } from "lucide-react";
import { api } from "../api";
import { formatClock } from "../lib";

export default function AlertsPage({ snapshot, config }) {
  const { alerts, pendingReallocations, resources, patients } = snapshot;
  const resourceById = Object.fromEntries(resources.map((r) => [r.id, r]));
  const floorName = (code) => config.floors.find((f) => f.code === code)?.name || code;
  async function confirm(id) { await api.confirmReallocation(id); }
  async function dismiss(id) { await api.dismissReallocation(id); }
  async function dismissAlert(id) { await api.dismissAlert(id); }
  return (
    <div>
      <h1 className="page-title">Alerts</h1>
      <p className="page-sub">Capacity warnings and reallocation recommendations that need your review.</p>
      {pendingReallocations.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <h3 className="panel-title">Reallocation Recommended</h3>
          {pendingReallocations.map((rec) => {
            const from = resourceById[rec.fromResourceId];
            const to = resourceById[rec.toResourceId];
            const p = patients[rec.patientId];
            return (
              <div className="recommend-card" key={rec.id}>
                <div className="recommend-title"><ArrowRightLeft size={13} /> Patient {p?.name ? `${p.name} (${rec.patientId})` : rec.patientId}</div>
                <div className="recommend-body">
                  Current: {from ? `${floorName(from.floor)}, ${from.id}` : "—"}<br />
                  Recommended: {to ? `${floorName(to.floor)}, ${to.id}` : "—"}<br />
                  <span className="muted">Reason: a higher-suitability resource is now available for this patient.</span>
                </div>
                <div className="recommend-actions">
                  <button className="btn btn-solid" onClick={() => confirm(rec.id)}>Confirm</button>
                  <button className="btn" onClick={() => dismiss(rec.id)}>Dismiss</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <h3 className="panel-title">Active Alerts</h3>
      {alerts.length === 0 ? <div className="empty-note">No active alerts — all clear.</div> : (
        <div className="stack" style={{ gap: 8 }}>
          {alerts.map((a) => (
            <div className="alert-item" key={a.id} style={{ justifyContent: "space-between" }}>
              <div className="row" style={{ gap: 8 }}>
                <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                <span><span className="mono" style={{ opacity: 0.6, marginRight: 6 }}>{formatClock(a.time)}</span>{a.message}</span>
              </div>
              <button onClick={() => dismissAlert(a.id)} style={{ background: "none", border: "none", flexShrink: 0 }}><X size={14} style={{ color: "#f43f5e" }} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
