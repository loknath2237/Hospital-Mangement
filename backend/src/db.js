const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

// Uses Node's built-in SQLite module (Node 22.5+ / stable on 24+) instead of
// better-sqlite3 — this avoids native compilation entirely (no node-gyp, no
// Visual Studio / build-essential needed on any platform). If you're on an
// older Node without node:sqlite, upgrade Node rather than downgrading this.

const dbPath = path.join(__dirname, "..", "dev.db");
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL");
db.exec(fs.readFileSync(path.join(__dirname, "..", "schema.sql"), "utf8"));

const upsertPatientStmt = db.prepare(`
  INSERT INTO patients (id, name, arrivalTime, age, injurySeverity, condition, emergency, requiredMonitoring, mobility, expectedLOS, equipmentRequired, isolationRequired, otRequired, icuRequired, doctorUrgency, status, assignedResourceId, admissionTime, dischargeTime, clinicalClass, clinicalScore)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    status=excluded.status, assignedResourceId=excluded.assignedResourceId, admissionTime=excluded.admissionTime,
    dischargeTime=excluded.dischargeTime, clinicalClass=excluded.clinicalClass, clinicalScore=excluded.clinicalScore,
    injurySeverity=excluded.injurySeverity, requiredMonitoring=excluded.requiredMonitoring, doctorUrgency=excluded.doctorUrgency,
    icuRequired=excluded.icuRequired, updatedAt=CURRENT_TIMESTAMP
`);

function savePatient(p) {
  upsertPatientStmt.run(
    p.id, p.name || null, p.arrivalTime, p.age, p.injurySeverity, p.condition,
    p.emergency ? 1 : 0, p.requiredMonitoring, p.mobility, p.expectedLOS,
    JSON.stringify(p.equipmentRequired), p.isolationRequired ? 1 : 0,
    p.otRequired ? 1 : 0, p.icuRequired ? 1 : 0, p.doctorUrgency,
    p.status, p.assignedResourceId || null, p.admissionTime, p.dischargeTime,
    p.clinicalClass, p.clinicalScore
  );
}

const insertEventStmt = db.prepare(`INSERT INTO allocation_events (id, simTime, message) VALUES (?, ?, ?)`);
function saveNewLogEntries(state, countBefore) {
  const newCount = state.log.length - countBefore;
  if (newCount <= 0) return;
  const entries = state.log.slice(0, newCount);
  db.exec("BEGIN");
  try {
    for (const e of entries) insertEventStmt.run(e.id, e.time, e.message);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

const insertAlertStmt = db.prepare(`INSERT INTO alerts (id, simTime, message, level) VALUES (?, ?, ?, ?)`);
function saveNewAlerts(state, countBefore) {
  const newCount = state.alerts.length - countBefore;
  if (newCount <= 0) return;
  const entries = state.alerts.slice(0, newCount);
  db.exec("BEGIN");
  try {
    for (const a of entries) insertAlertStmt.run(a.id, a.time, a.message, a.level || "critical");
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

const insertRunHistoryStmt = db.prepare(`INSERT INTO run_history (mode, admissions, avgWait, avgCriticalWait, reallocations, overflowEvents) VALUES (?, ?, ?, ?, ?, ?)`);
function saveRunHistory(summary) {
  insertRunHistoryStmt.run(summary.mode, summary.admissions, summary.avgWait, summary.avgCriticalWait, summary.reallocations, summary.overflowEvents);
}
function getRunHistory() {
  return db.prepare(`SELECT * FROM run_history ORDER BY createdAt ASC`).all();
}
function getRecentEvents(limit = 200) {
  return db.prepare(`SELECT * FROM allocation_events ORDER BY createdAt DESC LIMIT ?`).all(limit);
}
function getAdminByUsername(username) {
  return db.prepare(`SELECT * FROM admins WHERE username = ?`).get(username);
}
function createAdmin(username, passwordHash, salt) {
  db.prepare(`INSERT INTO admins (username, passwordHash, salt) VALUES (?, ?, ?)`).run(username, passwordHash, salt);
}
function countAdmins() {
  return db.prepare(`SELECT COUNT(*) c FROM admins`).get().c;
}

module.exports = { db, savePatient, saveNewLogEntries, saveNewAlerts, saveRunHistory, getRunHistory, getRecentEvents, getAdminByUsername, createAdmin, countAdmins };
