-- Real-Time Hospital Bed & ICU Allocation Engine — database schema
-- SQLite by default (zero setup). Portable to Postgres/Supabase with minor
-- syntax changes noted in README.md.

CREATE TABLE IF NOT EXISTS admins (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  username     TEXT NOT NULL UNIQUE,
  passwordHash TEXT NOT NULL,
  salt         TEXT NOT NULL,
  createdAt    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS patients (
  id                 TEXT PRIMARY KEY,
  name               TEXT,
  arrivalTime        INTEGER NOT NULL,
  age                INTEGER NOT NULL,
  injurySeverity     INTEGER NOT NULL,
  condition          TEXT NOT NULL,
  emergency          INTEGER NOT NULL,
  requiredMonitoring INTEGER NOT NULL,
  mobility           TEXT NOT NULL,
  expectedLOS        INTEGER NOT NULL,
  equipmentRequired  TEXT NOT NULL,
  isolationRequired  INTEGER NOT NULL,
  otRequired         INTEGER NOT NULL,
  icuRequired        INTEGER NOT NULL,
  doctorUrgency      INTEGER NOT NULL,
  status             TEXT NOT NULL,
  assignedResourceId TEXT UNIQUE,
  admissionTime      INTEGER,
  dischargeTime      INTEGER,
  clinicalClass      INTEGER NOT NULL,
  clinicalScore      REAL NOT NULL,
  createdAt          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS allocation_events (
  id        TEXT PRIMARY KEY,
  simTime   INTEGER NOT NULL,
  message   TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alerts (
  id        TEXT PRIMARY KEY,
  simTime   INTEGER NOT NULL,
  message   TEXT NOT NULL,
  level     TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS run_history (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  mode            TEXT NOT NULL,
  admissions      INTEGER NOT NULL,
  avgWait         INTEGER NOT NULL,
  avgCriticalWait INTEGER NOT NULL,
  reallocations   INTEGER NOT NULL,
  overflowEvents  INTEGER NOT NULL,
  createdAt       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_patients_status ON patients(status);
CREATE INDEX IF NOT EXISTS idx_events_created ON allocation_events(createdAt);
