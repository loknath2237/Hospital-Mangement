const BASE = "/api";
async function j(res) {
  if (!res.ok) {
    let msg = res.statusText;
    try { const body = await res.json(); msg = body.error || body.reason || msg; } catch { /* ignore */ }
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return res.json();
}
const post = (path, body) => fetch(`${BASE}${path}`, {
  method: "POST", credentials: "include",
  headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
  body: body !== undefined ? JSON.stringify(body) : undefined,
}).then(j);
const get = (path) => fetch(`${BASE}${path}`, { credentials: "include" }).then(j);
const del = (path) => fetch(`${BASE}${path}`, { method: "DELETE", credentials: "include" }).then(j);

export const api = {
  login: (username, password) => post("/auth/login", { username, password }),
  logout: () => post("/auth/logout"),
  me: () => get("/auth/me"),
  getState: () => get("/state"),
  getConfig: () => get("/config"),
  getHistory: () => get("/history"),
  getEventLog: () => get("/events/log"),
  addPatient: (data) => post("/patients", data),
  quickPatient: (emergency) => post(`/patients/quick?emergency=${emergency}`),
  dischargeResource: (id) => post(`/resources/${id}/discharge`),
  completeSurgery: (id) => post(`/resources/${id}/complete-surgery`),
  updateCondition: (id, updates) => post(`/patients/${id}/condition`, updates),
  confirmReallocation: (id) => post(`/reallocations/${id}/confirm`),
  dismissReallocation: (id) => post(`/reallocations/${id}/dismiss`),
  advanceClock: (minutes) => post("/clock/advance", { minutes }),
  reset: () => post("/reset"),
  setAutoRun: (enabled) => post("/autorun", { enabled }),
  dismissAlert: (id) => del(`/alerts/${id}`),
};
