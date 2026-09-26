import React, { useMemo } from "react";
import { Scissors, ShieldPlus } from "lucide-react";
const prettyEquip = (t) => t.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export default function ResourcesPage({ snapshot, config }) {
  const { resources } = snapshot;
  const otList = resources.filter((r) => r.type === "OT");
  const isoTotal = resources.filter((r) => r.is_isolation_capable);
  const isoFree = isoTotal.filter((r) => r.status === "FREE");
  const equipmentStats = useMemo(() => config.equipmentTags.map((tag) => {
    const withTag = resources.filter((r) => r.equipment_tags?.includes(tag));
    const free = withTag.filter((r) => r.status === "FREE");
    return { tag, total: withTag.length, free: free.length };
  }), [resources, config.equipmentTags]);

  return (
    <div>
      <h1 className="page-title">Resources</h1>
      <p className="page-sub">Operating theatres, special equipment, and isolation capacity.</p>
      <div className="grid-2">
        <div className="panel">
          <h3 className="panel-title"><Scissors size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Operating Theatres</h3>
          <div className="stack" style={{ gap: 8 }}>
            {otList.map((ot) => (
              <div className="row between" key={ot.id} style={{ fontSize: 12.5, fontWeight: 700 }}>
                <span>{ot.id}</span>
                <span className={`badge ${ot.status === "FREE" ? "badge-4" : "badge-1"}`}>{ot.status === "FREE" ? "Available" : "In Use"}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <h3 className="panel-title"><ShieldPlus size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Isolation Capacity</h3>
          <div className="mini-grid">
            <div className="mini-stat">Isolation Rooms<div className="val">{isoTotal.length}</div></div>
            <div className="mini-stat">Currently Free<div className="val">{isoFree.length}</div></div>
          </div>
        </div>
        <div className="panel span-2">
          <h3 className="panel-title">Special Equipment Availability</h3>
          <div className="mini-grid">
            {equipmentStats.map((e) => <div className="mini-stat" key={e.tag}>{prettyEquip(e.tag)}<div className="val">{e.free}/{e.total} free</div></div>)}
          </div>
        </div>
      </div>
    </div>
  );
}
