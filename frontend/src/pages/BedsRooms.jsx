import React, { useState } from "react";
import { Building2, ChevronDown, ChevronUp } from "lucide-react";
import { bedClass } from "../lib";

export default function BedsRoomsPage({ snapshot, config }) {
  const { resources, patients } = snapshot;
  const [open, setOpen] = useState("F0");
  return (
    <div>
      <h1 className="page-title">Beds &amp; Rooms</h1>
      <p className="page-sub">Every bed, room, and ICU slot across all five floors.</p>
      {config.floors.map((f) => {
        const beds = resources.filter((r) => r.floor === f.code);
        const occ = beds.filter((r) => r.status === "OCCUPIED").length;
        const isOpen = open === f.code;
        return (
          <div className="floor-card" key={f.code}>
            <button className="floor-header" onClick={() => setOpen(isOpen ? null : f.code)}>
              <div className="floor-name"><Building2 size={14} style={{ color: "var(--primary)" }} /> {f.name} <span className="muted" style={{ fontWeight: 500 }}>&middot; {f.careLevel}</span></div>
              <div className="row"><span className="mono muted" style={{ fontSize: 12 }}>{occ}/{beds.length}</span>{isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</div>
            </button>
            {isOpen && (
              <div className="floor-body">
                {beds.map((r) => {
                  const p = patients[r.currentPatientId];
                  const title = `${r.id} — ${r.status}${p ? ` — ${p.name ? `${p.name} (${p.id})` : p.id}` : ""}${r.is_isolation_capable ? " — isolation-capable" : ""}`;
                  return <div key={r.id} title={title} className={`bed-cell ${bedClass(r, patients)} ${r.is_isolation_capable ? "bed-iso-ring" : ""} ${p && p.clinicalClass === 1 ? "pulse" : ""}`} />;
                })}
              </div>
            )}
          </div>
        );
      })}
      <div className="legend">
        <span><span className="legend-swatch" style={{ background: "#f4ede4" }} />Free</span>
        <span><span className="legend-swatch" style={{ background: "var(--p1)" }} />Critical patient</span>
        <span><span className="legend-swatch" style={{ background: "var(--p2)" }} />High priority</span>
        <span><span className="legend-swatch" style={{ background: "var(--p3)" }} />Moderate</span>
        <span><span className="legend-swatch" style={{ background: "var(--p4)" }} />Low priority</span>
        <span><span className="legend-swatch" style={{ background: "white", boxShadow: "0 0 0 2px var(--iso)" }} />Isolation-capable</span>
      </div>
    </div>
  );
}
