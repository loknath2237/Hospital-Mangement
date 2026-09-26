require("dotenv").config();
const express = require("express");
const cors = require("cors");
const {
  generateRandomPatient, createInitialEngine, seedInitialPatients,
  admitNewPatient, dischargePatient, completeSurgery, advanceClock, adjustPatient,
  updatePatientCondition, confirmReallocation, dismissRecommendation,
  summarizeRun, uid, FLOOR_CONFIG, EQUIPMENT_TAGS, PLAIN_CLASS_LABEL,
} = require("./engine");
const {
  savePatient, saveNewLogEntries, saveNewAlerts, saveRunHistory, getRunHistory, getRecentEvents,
  getAdminByUsername, createAdmin, countAdmins,
} = require("./db");
const {
  hashPassword, makeSalt, verifyPassword, createSession, destroySession,
  parseCookies, setSessionCookie, clearSessionCookie, requireAuth,
} = require("./auth");

const app = express();
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json());

const PORT = process.env.PORT || 4000;

(function seedAdmin() {
  if (countAdmins() > 0) return;
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || "admin123";
  const salt = makeSalt();
  createAdmin(username, hashPassword(password, salt), salt);
  console.log(`Seeded default admin account -> username: "${username}", password: "${password}" (change via .env)`);
})();

let state = createInitialEngine();
let currentMode = "DYNAMIC";
let autoRunInterval = null;
const sseClients = new Set();

function snapshot() {
  const queue = state.pq.toArray()
    .sort((a, b) => (a.classRank !== b.classRank ? a.classRank - b.classRank : b.score - a.score))
    .map((e) => ({ id: e.id, classRank: e.classRank, score: e.score }));
  return {
    clock: state.clock, mode: currentMode,
    resources: state.resources, patients: state.patients, queue,
    pendingReallocations: state.pendingReallocations,
    metrics: state.metrics, alerts: state.alerts, log: state.log.slice(0, 150),
  };
}
function broadcast() {
  const payload = `event: state\ndata: ${JSON.stringify(snapshot())}\n\n`;
  for (const res of sseClients) res.write(payload);
}
function persistPatients(ids) {
  for (const id of ids) {
    const p = state.patients[id];
    if (!p) continue;
    try { savePatient(p); } catch (e) { console.error("DB error (patient):", e.message); }
  }
}
function persistNewEntries(logLenBefore, alertLenBefore) {
  try { saveNewLogEntries(state, logLenBefore); } catch (e) { console.error("DB error (log):", e.message); }
  try { saveNewAlerts(state, alertLenBefore); } catch (e) { console.error("DB error (alert):", e.message); }
}

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  const admin = username ? getAdminByUsername(username) : null;
  if (!admin || !verifyPassword(password || "", admin.salt, admin.passwordHash)) {
    return res.status(401).json({ error: "Invalid username or password" });
  }
  const token = createSession(admin.username);
  setSessionCookie(res, token);
  res.json({ username: admin.username });
});

app.post("/api/auth/logout", (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies.session) destroySession(cookies.session);
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get("/api/auth/me", requireAuth, (req, res) => res.json({ username: req.admin.username }));

app.use("/api", (req, res, next) => {
  if (req.path === "/auth/login") return next();
  return requireAuth(req, res, next);
});

app.get("/api/state", (req, res) => res.json(snapshot()));
app.get("/api/config", (req, res) => res.json({ floors: FLOOR_CONFIG, equipmentTags: EQUIPMENT_TAGS, classLabels: PLAIN_CLASS_LABEL }));
app.get("/api/history", (req, res) => { try { res.json(getRunHistory()); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get("/api/events/log", (req, res) => { try { res.json(getRecentEvents(200)); } catch (e) { res.status(500).json({ error: e.message }); } });

app.post("/api/patients", (req, res) => {
  try {
    const f = req.body;
    const patient = {
      id: uid("P"), name: (f.name || "").trim() || null, arrivalTime: state.clock, age: Number(f.age), injurySeverity: Number(f.injurySeverity),
      condition: f.condition, emergency: !!f.emergency, requiredMonitoring: Number(f.requiredMonitoring), mobility: f.mobility,
      expectedLOS: Number(f.expectedLOS), equipmentRequired: f.equipmentRequired || [], isolationRequired: !!f.isolationRequired,
      otRequired: !!f.otRequired, icuRequired: !!f.icuRequired || Number(f.requiredMonitoring) >= 4, doctorUrgency: Number(f.doctorUrgency),
      status: "WAITING", assignedResourceId: null, admissionTime: null, dischargeTime: null, needsUrgentReallocation: false, overflowFlagged: false,
    };
    const logLenBefore = state.log.length, alertLenBefore = state.alerts.length;
    admitNewPatient(state, patient, currentMode, patient.emergency);
    persistPatients([patient.id]);
    persistNewEntries(logLenBefore, alertLenBefore);
    broadcast();
    res.json({ patient, resource: patient.assignedResourceId ? state.resources.find((r) => r.id === patient.assignedResourceId) : null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/patients/quick", (req, res) => {
  try {
    const emergency = req.query.emergency === "true";
    const patient = generateRandomPatient(state.clock, emergency);
    const logLenBefore = state.log.length, alertLenBefore = state.alerts.length;
    admitNewPatient(state, patient, currentMode, emergency);
    persistPatients([patient.id]);
    persistNewEntries(logLenBefore, alertLenBefore);
    broadcast();
    res.json({ patient, resource: patient.assignedResourceId ? state.resources.find((r) => r.id === patient.assignedResourceId) : null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/resources/:id/discharge", (req, res) => {
  try {
    const resource = state.resources.find((r) => r.id === req.params.id);
    const patientId = resource ? resource.currentPatientId : null;
    const logLenBefore = state.log.length, alertLenBefore = state.alerts.length;
    dischargePatient(state, req.params.id, currentMode);
    const touched = new Set(Object.values(state.patients).filter((p) => p.status === "ADMITTED" || p.id === patientId).map((p) => p.id));
    persistPatients(touched);
    persistNewEntries(logLenBefore, alertLenBefore);
    broadcast();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/resources/:id/complete-surgery", (req, res) => {
  try {
    const resource = state.resources.find((r) => r.id === req.params.id);
    const patientId = resource ? resource.currentPatientId : null;
    const logLenBefore = state.log.length, alertLenBefore = state.alerts.length;
    completeSurgery(state, req.params.id, currentMode);
    if (patientId) persistPatients([patientId]);
    persistNewEntries(logLenBefore, alertLenBefore);
    broadcast();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/patients/:id/condition", (req, res) => {
  try {
    const logLenBefore = state.log.length, alertLenBefore = state.alerts.length;
    const result = updatePatientCondition(state, req.params.id, req.body || {}, currentMode);
    if (!result.ok) return res.status(400).json(result);
    persistPatients([req.params.id]);
    persistNewEntries(logLenBefore, alertLenBefore);
    broadcast();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/reallocations/:id/confirm", (req, res) => {
  try {
    const result = confirmReallocation(state, req.params.id, currentMode);
    if (!result.ok) return res.status(409).json(result);
    persistPatients(Object.values(state.patients).filter((p) => p.status === "ADMITTED").map((p) => p.id));
    broadcast();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/reallocations/:id/dismiss", (req, res) => {
  const ok = dismissRecommendation(state, req.params.id);
  broadcast();
  res.json({ ok });
});

app.post("/api/clock/advance", (req, res) => {
  try {
    const minutes = Number(req.body.minutes) || 15;
    advanceClock(state, minutes, currentMode);
    broadcast();
    res.json({ clock: state.clock });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/mode", (req, res) => {
  try {
    const newMode = req.body.mode;
    if (!["DYNAMIC", "STATIC", "FCFS"].includes(newMode)) return res.status(400).json({ error: "invalid mode" });
    if (state.metrics.admissions > 0) {
      try { saveRunHistory(summarizeRun(currentMode, state.metrics)); } catch (e) { console.error("DB error (history):", e.message); }
    }
    state = createInitialEngine();
    seedInitialPatients(state, newMode);
    persistPatients(Object.keys(state.patients));
    currentMode = newMode;
    broadcast();
    res.json(snapshot());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/reset", (req, res) => {
  try {
    if (state.metrics.admissions > 0) {
      try { saveRunHistory(summarizeRun(currentMode, state.metrics)); } catch (e) { console.error("DB error (history):", e.message); }
    }
    state = createInitialEngine();
    seedInitialPatients(state, currentMode);
    persistPatients(Object.keys(state.patients));
    broadcast();
    res.json(snapshot());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/alerts/:id", (req, res) => {
  state.alerts = state.alerts.filter((a) => a.id !== req.params.id);
  broadcast();
  res.json({ ok: true });
});

app.post("/api/autorun", (req, res) => {
  const enabled = !!req.body.enabled;
  if (enabled && !autoRunInterval) {
    autoRunInterval = setInterval(() => {
      const logLenBefore = state.log.length, alertLenBefore = state.alerts.length;
      const r = Math.random();
      let touched = [];
      if (r < 0.12) { const p = generateRandomPatient(state.clock, true); admitNewPatient(state, p, currentMode, true); touched.push(p.id); }
      else if (r < 0.45) { const p = generateRandomPatient(state.clock, false); admitNewPatient(state, p, currentMode, false); touched.push(p.id); }
      else if (r < 0.7) {
        const occ = state.resources.filter((x) => x.status === "OCCUPIED" && x.type !== "OT");
        if (occ.length) {
          const target = occ[Math.floor(Math.random() * occ.length)];
          const pid = target.currentPatientId;
          dischargePatient(state, target.id, currentMode);
          touched = Object.values(state.patients).filter((p) => p.status === "ADMITTED" || p.id === pid).map((p) => p.id);
        }
      }
      advanceClock(state, 10 + Math.floor(Math.random() * 20), currentMode);
      persistPatients(touched);
      persistNewEntries(logLenBefore, alertLenBefore);
      broadcast();
    }, 1500);
  } else if (!enabled && autoRunInterval) {
    clearInterval(autoRunInterval);
    autoRunInterval = null;
  }
  res.json({ autoRun: !!autoRunInterval });
});

app.get("/api/events/stream", (req, res) => {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.write(`event: state\ndata: ${JSON.stringify(snapshot())}\n\n`);
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
});

seedInitialPatients(state, currentMode);
persistPatients(Object.keys(state.patients));
app.listen(PORT, () => console.log(`Hospital allocation backend listening on http://localhost:${PORT}`));
