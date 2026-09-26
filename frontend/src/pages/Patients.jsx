import React, { useMemo, useState } from "react";
import { Activity, XCircle, Scissors, X } from "lucide-react";
import { api } from "../api";
import { CLASS_LABEL, CLASS_BADGE, SEVERITY_LABEL, URGENCY_LABEL, MONITORING_LABEL, statusLabel } from "../lib";

function UpdateConditionModal({ patient, onClose, onSaved }) {
  const [severity, setSeverity] = useState(patient.injurySeverity);
  const [urgency, setUrgency] = useState(patient.doctorUrgency);
  const [monitoring, setMonitoring] = useState(patient.requiredMonitoring);
  const [isolation, setIsolation] = useState(patient.isolationRequired);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true); setError("");
    try {
      await api.updateCondition(patient.id, { injurySeverity: severity, doctorUrgency: urgency, requiredMonitoring: monitoring, isolationRequired: isolation });
      onSaved();
    } catch (e) { setError(e.message || "Could not update this patient's condition."); }
    finally { setSaving(false); }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 4 }}>
          <div className="modal-title">Update Patient Condition</div>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-sub">Patient {patient.name ? `${patient.name} (${patient.id})` : patient.id} &middot; currently {CLASS_LABEL[patient.clinicalClass]} priority</div>
        {error && <div className="login-error">{error}</div>}
        <div className="stack">
          <label className="field">Injury Severity
            <select className="select" style={{ width: "100%" }} value={severity} onChange={(e) => setSeverity(Number(e.target.value))}>
              {Object.entries(SEVERITY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="field">Doctor-Assigned Urgency
            <select className="select" style={{ width: "100%" }} value={urgency} onChange={(e) => setUrgency(Number(e.target.value))}>
              {Object.entries(URGENCY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="field">Monitoring Needed
            <select className="select" style={{ width: "100%" }} value={monitoring} onChange={(e) => setMonitoring(Number(e.target.value))}>
              {Object.entries(MONITORING_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="checkbox-row"><input type="checkbox" checked={isolation} onChange={(e) => setIsolation(e.target.checked)} /> Isolation required</label>
        </div>
        <button className="submit-btn" disabled={saving} onClick={save}>{saving ? "Saving…" : "Update Condition"}</button>
      </div>
    </div>
  );
}

export default function PatientsPage({ snapshot }) {
  const { patients, resources } = snapshot;
  const [filter, setFilter] = useState("ALL");
  const [editing, setEditing] = useState(null);
  const resourceById = useMemo(() => Object.fromEntries(resources.map((r) => [r.id, r])), [resources]);

  const list = useMemo(() => {
    const filtered = filter === "ALL" ? Object.values(patients).filter((p) => p.status !== "DISCHARGED") : Object.values(patients).filter((p) => p.status === filter);
    return filtered.sort((a, b) => a.clinicalClass - b.clinicalClass || a.arrivalTime - b.arrivalTime);
  }, [patients, filter]);

  async function discharge(patient) { if (patient.assignedResourceId) await api.dischargeResource(patient.assignedResourceId); }
  async function completeSurgery(patient) { if (patient.assignedResourceId) await api.completeSurgery(patient.assignedResourceId); }

  return (
    <div>
      <h1 className="page-title">Patients</h1>
      <p className="page-sub">Everyone currently waiting or admitted.</p>
      <div className="tabs" style={{ padding: 0, marginBottom: 14 }}>
        {["ALL", "WAITING", "ADMITTED"].map((f) => (
          <button key={f} className={`tab ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>{f === "ALL" ? "All" : f === "WAITING" ? "Waiting" : "Admitted"}</button>
        ))}
      </div>
      <div className="table-wrap">
        {list.length === 0 ? <div className="empty-note">No patients in this view.</div> : list.map((p) => {
          const res = resourceById[p.assignedResourceId];
          return (
            <div className="patient-row" key={p.id}>
              <span className={`badge ${CLASS_BADGE[p.clinicalClass]}`}>{CLASS_LABEL[p.clinicalClass]}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="patient-id">{p.name ? `${p.name} (${p.id})` : p.id} <span className="muted" style={{ fontWeight: 600 }}>&middot; {p.condition}</span></div>
                <div className="patient-meta">{statusLabel(p)}{p.needsUrgentReallocation ? " · needs urgent reallocation" : ""}</div>
              </div>
              <div className="row" style={{ flexShrink: 0 }}>
                {p.status !== "DISCHARGED" && <button className="btn" onClick={() => setEditing(p)}><Activity size={12} /> Update Condition</button>}
                {p.status === "ADMITTED" && res?.is_OT && <button className="btn" onClick={() => completeSurgery(p)}><Scissors size={12} /> Complete Surgery</button>}
                {p.status === "ADMITTED" && !res?.is_OT && <button className="btn" onClick={() => discharge(p)}><XCircle size={12} /> Discharge</button>}
              </div>
            </div>
          );
        })}
      </div>
      {editing && <UpdateConditionModal patient={editing} onClose={() => setEditing(null)} onSaved={() => setEditing(null)} />}
    </div>
  );
}
