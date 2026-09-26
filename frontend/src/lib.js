export function formatClock(mins) {
  if (mins === null || mins === undefined) return "—";
  const h = Math.floor(mins / 60) % 24, m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
export const CLASS_LABEL = { 1: "Critical", 2: "High", 3: "Moderate", 4: "Low" };
export const CLASS_BADGE = { 1: "badge-1", 2: "badge-2", 3: "badge-3", 4: "badge-4" };
export const MONITORING_LABEL = { 0: "Self-care only", 1: "Basic periodic checks", 2: "Continuous monitoring", 3: "High-dependency care", 4: "ICU-level care" };
export const SEVERITY_LABEL = { 1: "Minor", 2: "Moderate", 3: "Serious", 4: "Severe", 5: "Life-threatening" };
export const URGENCY_LABEL = { 1: "Routine", 2: "Elevated", 3: "High", 4: "Urgent", 5: "Immediate" };
export function bedClass(resource, patientsById) {
  if (resource.status === "FREE") {
    if (resource.type === "ICU_BED") return "bed-free-icu";
    if (resource.type === "OT") return "bed-free-ot";
    return "bed-free-general";
  }
  const p = patientsById[resource.currentPatientId];
  const cls = p ? p.clinicalClass : 4;
  return `bed-p${cls}`;
}
export function statusLabel(patient) {
  if (patient.status === "WAITING") return "Waiting for a bed";
  if (patient.status === "ADMITTED") return `Admitted — ${patient.assignedResourceId}`;
  return "Discharged";
}
