/* ============================================================================
   CONSTANTS & TAXONOMY
   ========================================================================== */

const EQUIPMENT_TAGS = ["VENTILATOR", "CARDIAC_MONITOR", "DEFIBRILLATOR", "DIALYSIS", "INFUSION_PUMP", "TRACTION", "OXYGEN_SUPPLY"];

const FLOOR_CONFIG = [
  { code: "F0", order: 0, name: "Ground Floor", careLevel: "Critical / Emergency" },
  { code: "F1", order: 1, name: "1st Floor", careLevel: "High Dependency" },
  { code: "F2", order: 2, name: "2nd Floor", careLevel: "General Care" },
  { code: "F3", order: 3, name: "3rd Floor", careLevel: "Recovery / Long Stay" },
  { code: "F4", order: 4, name: "4th Floor", careLevel: "Specialized / Post-Op" },
  { code: "F5", order: 5, name: "5th Floor", careLevel: "Stable / Low Dependency" },
];
const floorOrder = (code) => FLOOR_CONFIG.find((f) => f.code === code)?.order ?? 2;

const CLASS_META = {
  1: { label: "P1 Critical", bg: "bg-red-500", text: "text-red-400", border: "border-red-500", soft: "bg-red-500/10" },
  2: { label: "P2 High", bg: "bg-amber-500", text: "text-amber-400", border: "border-amber-500", soft: "bg-amber-500/10" },
  3: { label: "P3 Moderate", bg: "bg-blue-500", text: "text-blue-400", border: "border-blue-500", soft: "bg-blue-500/10" },
  4: { label: "P4 Low", bg: "bg-emerald-500", text: "text-emerald-400", border: "border-emerald-500", soft: "bg-emerald-500/10" },
};
const PLAIN_CLASS_LABEL = { 1: "Critical", 2: "High", 3: "Moderate", 4: "Low" };

const RELOCATION_THRESHOLD = 0.75;
const CONDITIONS = ["Cardiac event", "Respiratory distress", "Trauma / fracture", "Post-surgical recovery", "Infection / sepsis risk", "Stable observation", "Neurological event", "General weakness"];

let _idCounter = 1;
const uid = (prefix) => `${prefix}${String(_idCounter++).padStart(4, "0")}`;
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[randInt(0, arr.length - 1)];
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/* ============================================================================
   RESOURCE MODEL
   ========================================================================== */

function makeBed(floor, idx, { monitoring, equipment, isolation = false }) {
  return {
    id: `${floor}-R${String(idx).padStart(3, "0")}-B1`, floor, type: "GENERAL_BED",
    max_monitoring_level: monitoring, is_ICU: false, is_isolation_capable: isolation, is_OT: false,
    equipment_tags: equipment, status: "FREE", currentPatientId: null,
  };
}
function makeICU(idx, isolation = false) {
  return {
    id: `F0-ICU-${String(idx).padStart(2, "0")}`, floor: "F0", type: "ICU_BED",
    max_monitoring_level: 4, is_ICU: true, is_isolation_capable: isolation, is_OT: false,
    equipment_tags: ["VENTILATOR", "CARDIAC_MONITOR", "DEFIBRILLATOR", "DIALYSIS", "INFUSION_PUMP"],
    status: "FREE", currentPatientId: null,
  };
}
function makeOT(floor, idx, isolation = false) {
  return {
    id: `${floor}-OT-${String(idx).padStart(2, "0")}`, floor, type: "OT",
    max_monitoring_level: 4, is_ICU: false, is_isolation_capable: isolation, is_OT: true,
    equipment_tags: ["VENTILATOR", "CARDIAC_MONITOR", "DEFIBRILLATOR", "INFUSION_PUMP"],
    status: "FREE", currentPatientId: null,
  };
}

function generateResources() {
  const r = [];
  for (let i = 1; i <= 10; i++) r.push(makeICU(i, i <= 2));
  for (let i = 1; i <= 6; i++) r.push(makeBed("F0", i, { monitoring: 3, equipment: ["CARDIAC_MONITOR", "INFUSION_PUMP", "OXYGEN_SUPPLY"] }));
  r.push(makeOT("F0", 1, true));
  for (let i = 1; i <= 18; i++) r.push(makeBed("F1", i, { monitoring: 3, equipment: ["CARDIAC_MONITOR", "INFUSION_PUMP", "OXYGEN_SUPPLY", "TRACTION"], isolation: i <= 2 }));
  for (let i = 1; i <= 30; i++) r.push(makeBed("F2", i, { monitoring: 2, equipment: ["INFUSION_PUMP", "OXYGEN_SUPPLY"], isolation: i === 1 }));
  for (let i = 1; i <= 24; i++) r.push(makeBed("F3", i, { monitoring: 1, equipment: ["OXYGEN_SUPPLY"], isolation: i === 1 }));
  for (let i = 1; i <= 18; i++) r.push(makeBed("F4", i, { monitoring: 2, equipment: ["INFUSION_PUMP", "TRACTION", "DIALYSIS", "CARDIAC_MONITOR"], isolation: i <= 2 }));
  r.push(makeOT("F4", 1)); r.push(makeOT("F4", 2));
  for (let i = 1; i <= 24; i++) r.push(makeBed("F5", i, { monitoring: i <= 12 ? 1 : 0, equipment: i % 2 === 0 ? ["OXYGEN_SUPPLY"] : [] }));
  return r;
}

/* ============================================================================
   INDEXED PRIORITY QUEUE — binary heap with O(log n) insert / update / remove
   ========================================================================== */

class IndexedPriorityQueue {
  constructor() { this.heap = []; this.pos = new Map(); this.items = new Map(); }
  size() { return this.heap.length; }
  has(id) { return this.pos.has(id); }
  _better(i, j) {
    const a = this.items.get(this.heap[i]), b = this.items.get(this.heap[j]);
    if (a.classRank !== b.classRank) return a.classRank < b.classRank;
    return a.score > b.score;
  }
  _swap(i, j) {
    const hi = this.heap[i], hj = this.heap[j];
    this.heap[i] = hj; this.heap[j] = hi;
    this.pos.set(hj, i); this.pos.set(hi, j);
  }
  _siftUp(i) { while (i > 0) { const p = (i - 1) >> 1; if (this._better(i, p)) { this._swap(i, p); i = p; } else break; } }
  _siftDown(i) {
    const n = this.heap.length;
    while (true) {
      let best = i; const l = 2 * i + 1, rr = 2 * i + 2;
      if (l < n && this._better(l, best)) best = l;
      if (rr < n && this._better(rr, best)) best = rr;
      if (best !== i) { this._swap(i, best); i = best; } else break;
    }
  }
  insert(id, item) {
    this.items.set(id, item); this.heap.push(id);
    const i = this.heap.length - 1; this.pos.set(id, i); this._siftUp(i);
  }
  updateItem(id, item) {
    if (!this.pos.has(id)) return this.insert(id, item);
    this.items.set(id, item);
    const i = this.pos.get(id); this._siftUp(i); this._siftDown(this.pos.get(id));
  }
  remove(id) {
    if (!this.pos.has(id)) return;
    const i = this.pos.get(id), last = this.heap.length - 1;
    this._swap(i, last); this.heap.pop(); this.pos.delete(id); this.items.delete(id);
    if (i < this.heap.length) { this._siftUp(i); this._siftDown(i); }
  }
  toArray() { return this.heap.map((id) => ({ id, ...this.items.get(id) })); }
}

/* ============================================================================
   PRIORITY MODEL
   ========================================================================== */

function computeClass(p) {
  if (p.emergency || p.injurySeverity >= 5 || p.requiredMonitoring >= 4 || p.otRequired) return 1;
  if (p.injurySeverity >= 4 || p.requiredMonitoring >= 3 || p.doctorUrgency >= 4) return 2;
  if (p.injurySeverity >= 2 || p.requiredMonitoring >= 1) return 3;
  return 4;
}
function computeScore(p, clock) {
  const severityNorm = p.injurySeverity / 5;
  const urgencyNorm = p.doctorUrgency / 5;
  const ageRiskNorm = p.age < 5 || p.age > 65 ? 1 : Math.min(p.age / 100, 0.5);
  const waitMinutes = Math.max(0, clock - p.arrivalTime);
  const waitNorm = Math.min(waitMinutes / 240, 1);
  return 0.4 * severityNorm + 0.3 * urgencyNorm + 0.1 * ageRiskNorm + 0.2 * waitNorm;
}
function pqItemFor(patient, mode) {
  if (mode === "FCFS") return { classRank: 1, score: -patient.arrivalTime };
  if (mode === "STATIC") return { classRank: patient.queueClass, score: patient.queueScore };
  return { classRank: patient.clinicalClass, score: patient.clinicalScore };
}
function suggestedFloorOrder(p) {
  if (p.clinicalClass === 1) return 0;
  if (p.clinicalClass === 2) return 1;
  if (p.clinicalClass === 3) return p.expectedLOS > 10 ? 3 : 2;
  return p.expectedLOS > 10 ? 5 : 3;
}

/* ============================================================================
   FEASIBILITY FILTER + RANKING
   ========================================================================== */

function isResourceFeasibleFor(patient, r) {
  if (r.status !== "FREE") return false;
  if (r.max_monitoring_level < patient.requiredMonitoring) return false;
  if (patient.isolationRequired && !r.is_isolation_capable) return false;
  if (patient.otRequired ? !r.is_OT : r.is_OT) return false;
  if (!patient.equipmentRequired.every((tag) => r.equipment_tags.includes(tag))) return false;
  return true;
}
const getFeasible = (patient, resources) => resources.filter((r) => isResourceFeasibleFor(patient, r));
const overshoot = (r, patient) => r.max_monitoring_level - patient.requiredMonitoring;
function rankCandidates(patient, candidates) {
  const pref = suggestedFloorOrder(patient);
  return [...candidates].sort((a, b) => {
    const oa = overshoot(a, patient), ob = overshoot(b, patient);
    if (oa !== ob) return oa - ob;
    const da = Math.abs(pref - floorOrder(a.floor)), db = Math.abs(pref - floorOrder(b.floor));
    if (da !== db) return da - db;
    if (!patient.isolationRequired) {
      const ia = a.is_isolation_capable ? 1 : 0, ib = b.is_isolation_capable ? 1 : 0;
      if (ia !== ib) return ia - ib;
    }
    return a.id.localeCompare(b.id);
  });
}

/* ============================================================================
   ENGINE
   ========================================================================== */

function log(state, message) { state.log.unshift({ id: uid("L"), time: state.clock, message }); if (state.log.length > 300) state.log.length = 300; }
function addAlert(state, message, level = "critical") { state.alerts.unshift({ id: uid("A"), time: state.clock, message, level }); if (state.alerts.length > 100) state.alerts.length = 100; }

function allocate(state, patient, resource) {
  resource.status = "OCCUPIED"; resource.currentPatientId = patient.id;
  patient.status = "ADMITTED"; patient.assignedResourceId = resource.id; patient.admissionTime = state.clock;
  const wait = Math.max(0, state.clock - patient.arrivalTime);
  state.metrics.admissions += 1; state.metrics.totalWait += wait;
  if (patient.clinicalClass === 1) state.metrics.criticalWaits.push(wait);
  patient.overflowFlagged = false;
  state.pq.remove(patient.id);
  log(state, `${patient.id} allocated -> ${resource.id} (wait ${wait}m)`);
}
function reallocate(state, patient, newResource, urgent = false) {
  const oldRes = state.resources.find((r) => r.id === patient.assignedResourceId);
  if (oldRes) { oldRes.status = "FREE"; oldRes.currentPatientId = null; }
  newResource.status = "OCCUPIED"; newResource.currentPatientId = patient.id;
  patient.assignedResourceId = newResource.id; patient.needsUrgentReallocation = false;
  state.metrics.reallocations += 1;
  log(state, `${urgent ? "Urgent reallocation" : "Reallocated"}: ${patient.id} -> ${newResource.id}${oldRes ? ` (from ${oldRes.id})` : ""}`);
}
function maybeRaiseOverflowAlert(state, patient) {
  if (patient.clinicalClass <= 2 && !patient.overflowFlagged) {
    patient.overflowFlagged = true; state.metrics.overflowEvents += 1;
    addAlert(state, `CAPACITY ALERT: no feasible resource currently for ${patient.id} (Class P${patient.clinicalClass})`);
  }
}
function createRecommendation(state, patient, resource) {
  const already = state.pendingReallocations.find((r) => r.patientId === patient.id);
  if (already) return false;
  const fromRes = state.resources.find((r) => r.id === patient.assignedResourceId);
  state.pendingReallocations.push({
    id: uid("RC"), patientId: patient.id,
    fromResourceId: patient.assignedResourceId, toResourceId: resource.id,
    createdAt: state.clock,
  });
  log(state, `Reallocation recommended: ${patient.id} (${fromRes ? fromRes.id : "?"} -> ${resource.id})`);
  return true;
}
function confirmReallocation(state, recommendationId, mode) {
  const idx = state.pendingReallocations.findIndex((r) => r.id === recommendationId);
  if (idx === -1) return { ok: false, reason: "This recommendation no longer applies." };
  const rec = state.pendingReallocations[idx];
  state.pendingReallocations.splice(idx, 1);
  const patient = state.patients[rec.patientId];
  const targetRes = state.resources.find((r) => r.id === rec.toResourceId);
  if (!patient || patient.status !== "ADMITTED") return { ok: false, reason: "Patient is no longer admitted." };
  if (!targetRes || targetRes.status !== "FREE") return { ok: false, reason: "That resource is no longer available." };
  reallocate(state, patient, targetRes, false);
  runAllocationCycle(state, mode);
  return { ok: true };
}
function dismissRecommendation(state, recommendationId) {
  const idx = state.pendingReallocations.findIndex((r) => r.id === recommendationId);
  if (idx === -1) return false;
  const rec = state.pendingReallocations[idx];
  state.pendingReallocations.splice(idx, 1);
  log(state, `Reallocation recommendation dismissed for ${rec.patientId}`);
  return true;
}
function pickReallocationCandidate(state, freeResource) {
  let best = null, bestBenefit = -Infinity;
  Object.values(state.patients).forEach((p) => {
    if (p.status !== "ADMITTED") return;
    if (!isResourceFeasibleFor(p, freeResource)) return;
    const currentRes = state.resources.find((r) => r.id === p.assignedResourceId);
    if (!currentRes) return;
    const currentOvershoot = currentRes.max_monitoring_level - p.requiredMonitoring;
    let benefit = currentOvershoot - overshoot(freeResource, p);
    if (p.needsUrgentReallocation) benefit += 5; else if (p.clinicalClass <= 2) benefit += 0.5;
    if (benefit > bestBenefit) { bestBenefit = benefit; best = p; }
  });
  const threshold = best?.needsUrgentReallocation ? -Infinity : RELOCATION_THRESHOLD;
  return bestBenefit > threshold ? best : null;
}
function runAllocationCycle(state, mode) {
  let iterations = 0, progress = true;
  while (progress && iterations < 10) {
    progress = false; iterations += 1;
    const order = state.pq.toArray().sort((a, b) => (a.classRank !== b.classRank ? a.classRank - b.classRank : b.score - a.score));
    for (const entry of order) {
      const patient = state.patients[entry.id];
      if (!patient || patient.status !== "WAITING") continue;
      const candidates = getFeasible(patient, state.resources);
      if (candidates.length > 0) { allocate(state, patient, rankCandidates(patient, candidates)[0]); progress = true; }
      else maybeRaiseOverflowAlert(state, patient);
    }
    state.pendingReallocations = state.pendingReallocations.filter((rec) => {
      const patient = state.patients[rec.patientId];
      const targetRes = state.resources.find((r) => r.id === rec.toResourceId);
      return patient && patient.status === "ADMITTED" && targetRes && targetRes.status === "FREE";
    });
    const freeBeds = state.resources.filter((r) => r.status === "FREE" && r.type !== "OT");
    for (const res of freeBeds) {
      const candidate = pickReallocationCandidate(state, res);
      if (!candidate) continue;
      if (candidate.needsUrgentReallocation) {
        const fromResId = candidate.assignedResourceId;
        reallocate(state, candidate, res, true);
        addAlert(state, `${candidate.id} was automatically moved to ${res.id} because their condition worsened${fromResId ? ` (from ${fromResId})` : ""}`);
        progress = true;
      } else {
        if (createRecommendation(state, candidate, res)) progress = true;
      }
    }
  }
}
function admitNewPatient(state, patient, mode, verbose = false) {
  patient.clinicalClass = computeClass(patient);
  patient.clinicalScore = computeScore(patient, state.clock);
  patient.queueClass = patient.clinicalClass; patient.queueScore = patient.clinicalScore;
  state.patients[patient.id] = patient;
  state.pq.insert(patient.id, pqItemFor(patient, mode));
  if (verbose) {
    log(state, `EMERGENCY: ${patient.id} registered (pre-triage)`);
    log(state, `Triage complete -> Class P${patient.clinicalClass}`);
    log(state, `Priority queue recalculated`);
  } else {
    log(state, `${patient.id} registered -> Class P${patient.clinicalClass}, added to queue`);
  }
  runAllocationCycle(state, mode);
  if (verbose) log(state, patient.status === "ADMITTED" ? `Staff notified — ${patient.id} in ${patient.assignedResourceId}` : `${patient.id} remains queued — no immediately feasible resource`);
}
function dischargePatient(state, resourceId, mode) {
  const res = state.resources.find((r) => r.id === resourceId);
  if (!res || !res.currentPatientId) return;
  const p = state.patients[res.currentPatientId];
  p.status = "DISCHARGED"; p.dischargeTime = state.clock; p.assignedResourceId = null;
  res.status = "FREE"; res.currentPatientId = null;
  log(state, `${p.id} discharged, ${res.id} freed`);
  runAllocationCycle(state, mode);
}
function completeSurgery(state, resourceId, mode) {
  const res = state.resources.find((r) => r.id === resourceId);
  if (!res || !res.currentPatientId) return;
  const p = state.patients[res.currentPatientId];
  res.status = "FREE"; res.currentPatientId = null;
  p.otRequired = false; p.requiredMonitoring = Math.max(2, p.requiredMonitoring - 1);
  p.status = "WAITING"; p.assignedResourceId = null;
  p.clinicalClass = computeClass(p); p.clinicalScore = computeScore(p, state.clock);
  state.pq.insert(p.id, pqItemFor(p, mode));
  log(state, `${p.id} surgery complete in ${res.id} -> queued for recovery bed`);
  runAllocationCycle(state, mode);
}
function advanceClock(state, minutes, mode) {
  state.clock += minutes;
  Object.values(state.patients).forEach((p) => {
    if (p.status !== "WAITING") return;
    p.clinicalClass = computeClass(p); p.clinicalScore = computeScore(p, state.clock);
    if (mode === "DYNAMIC") state.pq.updateItem(p.id, { classRank: p.clinicalClass, score: p.clinicalScore });
  });
}
function adjustPatient(state, patientId, delta, mode) {
  const p = state.patients[patientId]; if (!p) return;
  p.injurySeverity = clamp(p.injurySeverity + delta, 1, 5);
  p.requiredMonitoring = clamp(p.requiredMonitoring + delta, 0, 4);
  p.doctorUrgency = clamp(p.doctorUrgency + delta, 1, 5);
  if (delta > 0) p.icuRequired = p.icuRequired || p.requiredMonitoring >= 4;
  p.clinicalClass = computeClass(p); p.clinicalScore = computeScore(p, state.clock);
  if (p.status === "WAITING" && mode === "DYNAMIC") state.pq.updateItem(p.id, { classRank: p.clinicalClass, score: p.clinicalScore });
  if (p.status === "ADMITTED" && delta > 0) {
    const res = state.resources.find((r) => r.id === p.assignedResourceId);
    if (res && res.max_monitoring_level < p.requiredMonitoring) {
      addAlert(state, `${p.id} deteriorated — ${res.id} no longer meets required monitoring`);
      const candidates = getFeasible(p, state.resources);
      if (candidates.length > 0) reallocate(state, p, rankCandidates(p, candidates)[0], true);
      else p.needsUrgentReallocation = true;
    }
  }
  log(state, `${p.id} ${delta > 0 ? "deteriorated" : "improved"} -> Class P${p.clinicalClass}`);
}
function updatePatientCondition(state, patientId, updates, mode) {
  const p = state.patients[patientId];
  if (!p) return { ok: false, reason: "Patient not found." };
  if (updates.injurySeverity !== undefined) p.injurySeverity = clamp(Number(updates.injurySeverity), 1, 5);
  if (updates.requiredMonitoring !== undefined) p.requiredMonitoring = clamp(Number(updates.requiredMonitoring), 0, 4);
  if (updates.doctorUrgency !== undefined) p.doctorUrgency = clamp(Number(updates.doctorUrgency), 1, 5);
  if (updates.isolationRequired !== undefined) p.isolationRequired = !!updates.isolationRequired;
  if (updates.otRequired !== undefined) p.otRequired = !!updates.otRequired;
  if (p.requiredMonitoring >= 4) p.icuRequired = true;
  p.clinicalClass = computeClass(p);
  p.clinicalScore = computeScore(p, state.clock);
  if (p.status === "WAITING" && mode === "DYNAMIC") state.pq.updateItem(p.id, { classRank: p.clinicalClass, score: p.clinicalScore });
  if (p.status === "ADMITTED") {
    const res = state.resources.find((r) => r.id === p.assignedResourceId);
    const nowUnsuitable = res && (res.max_monitoring_level < p.requiredMonitoring || (p.isolationRequired && !res.is_isolation_capable));
    if (nowUnsuitable) {
      addAlert(state, `${p.id}'s condition was updated — ${res.id} no longer meets their requirements`);
      const candidates = getFeasible(p, state.resources);
      if (candidates.length > 0) reallocate(state, p, rankCandidates(p, candidates)[0], true);
      else p.needsUrgentReallocation = true;
    }
  }
  log(state, `${p.id} condition updated -> Class P${p.clinicalClass}`);
  return { ok: true };
}

function generateRandomPatient(clock, forceEmergency = false) {
  const emergency = forceEmergency || Math.random() < 0.12;
  const severity = emergency ? randInt(4, 5) : randInt(1, 4);
  let monitoring = emergency ? randInt(3, 4) : randInt(0, 3);
  const doctorUrgency = emergency ? randInt(4, 5) : randInt(1, 4);
  const icuRequired = monitoring >= 4;
  const equipmentRequired = [];
  if (monitoring >= 3 && Math.random() < 0.5) equipmentRequired.push("VENTILATOR");
  if (Math.random() < 0.2) equipmentRequired.push("CARDIAC_MONITOR");
  return {
    id: uid("P"), name: null, arrivalTime: clock, age: randInt(1, 90), injurySeverity: severity, condition: pick(CONDITIONS),
    emergency, requiredMonitoring: monitoring, mobility: pick(["Independent", "Assisted", "Bedridden"]),
    expectedLOS: randInt(1, 20), equipmentRequired, isolationRequired: Math.random() < 0.12,
    otRequired: emergency && Math.random() < 0.25, icuRequired, doctorUrgency,
    status: "WAITING", assignedResourceId: null, admissionTime: null, dischargeTime: null,
    needsUrgentReallocation: false, overflowFlagged: false,
  };
}
function createInitialEngine() {
  return { resources: generateResources(), patients: {}, pq: new IndexedPriorityQueue(), clock: 9 * 60, log: [], alerts: [], pendingReallocations: [], metrics: { admissions: 0, totalWait: 0, criticalWaits: [], reallocations: 0, overflowEvents: 0 } };
}
function seedInitialPatients(state, mode) {
  for (let i = 0; i < 7; i++) {
    const p = generateRandomPatient(state.clock + i * 2, i === 5);
    admitNewPatient(state, p, mode, false);
  }
}
function summarizeRun(mode, metrics) {
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  return { mode, admissions: metrics.admissions, avgWait: Math.round(metrics.totalWait / (metrics.admissions || 1)), avgCriticalWait: Math.round(avg(metrics.criticalWaits)), reallocations: metrics.reallocations, overflowEvents: metrics.overflowEvents };
}
function formatClock(mins) {
  const h = Math.floor(mins / 60) % 24, m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

module.exports = {
  EQUIPMENT_TAGS, FLOOR_CONFIG, CLASS_META, PLAIN_CLASS_LABEL,
  generateResources, IndexedPriorityQueue,
  computeClass, computeScore, pqItemFor,
  isResourceFeasibleFor, getFeasible, rankCandidates,
  allocate, reallocate, runAllocationCycle, admitNewPatient,
  dischargePatient, completeSurgery, advanceClock, adjustPatient, updatePatientCondition,
  createRecommendation, confirmReallocation, dismissRecommendation,
  generateRandomPatient, createInitialEngine, seedInitialPatients,
  summarizeRun, formatClock, uid,
};

if (require.main === module && process.argv.includes("--selftest")) {
  const assert = (cond, msg) => { if (!cond) throw new Error("ASSERTION FAILED: " + msg); };
  const state = createInitialEngine();
  seedInitialPatients(state, "DYNAMIC");
  state.resources.forEach((r) => {
    if (r.status === "OCCUPIED") {
      const p = state.patients[r.currentPatientId];
      assert(p && p.status === "ADMITTED" && p.assignedResourceId === r.id, `Broken link for ${r.id}`);
    }
  });
  console.log("engine.js self-test passed:", state.resources.length, "resources,", Object.keys(state.patients).length, "patients seeded.");
}
