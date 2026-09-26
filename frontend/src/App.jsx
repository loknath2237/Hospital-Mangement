import React, { useEffect, useState, useCallback } from "react";
import { Activity, LayoutDashboard, Plus, Siren, Users, LayoutGrid, Bell, Boxes, LogOut, Lock, User } from "lucide-react";
import { api } from "./api";
import DashboardPage from "./pages/Dashboard";
import NewPatientPage from "./pages/NewPatient";
import PatientsPage from "./pages/Patients";
import BedsRoomsPage from "./pages/BedsRooms";
import AlertsPage from "./pages/Alerts";
import ResourcesPage from "./pages/Resources";

function LoginScreen({ onLoggedIn }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      const me = await api.login(username, password);
      onLoggedIn(me.username);
    } catch (err) { setError(err.message || "Login failed."); }
    finally { setBusy(false); }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-icon"><Activity size={24} /></div>
        <div className="login-title">Hospital Allocation Engine</div>
        <div className="login-sub">Administrator sign-in</div>
        {error && <div className="login-error">{error}</div>}
        <form onSubmit={submit}>
          <label className="login-field">Username<input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus /></label>
          <label className="login-field">Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          <button className="submit-btn" disabled={busy} type="submit"><Lock size={14} /> {busy ? "Signing in…" : "Sign In"}</button>
        </form>
        <div className="login-hint">Default: admin / admin123 (see backend/.env)</div>
      </div>
    </div>
  );
}

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "new-patient", label: "+ New Patient", icon: Plus },
  { id: "patients", label: "Patients", icon: Users },
  { id: "beds", label: "Beds & Rooms", icon: LayoutGrid },
  { id: "alerts", label: "Alerts", icon: Bell },
  { id: "resources", label: "Resources", icon: Boxes },
];

function AppShell({ username, onLogout }) {
  const [page, setPage] = useState("dashboard");
  const [snapshot, setSnapshot] = useState(null);
  const [config, setConfig] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => { api.getConfig().then(setConfig).catch(() => {}); }, []);
  useEffect(() => {
    const es = new EventSource("/api/events/stream");
    es.addEventListener("state", (e) => { setSnapshot(JSON.parse(e.data)); setConnected(true); });
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, []);

  const alertCount = (snapshot?.alerts.length || 0) + (snapshot?.pendingReallocations.length || 0);
  if (!snapshot || !config) return <div className="content-inner"><p className="muted">Loading hospital state…</p></div>;

  const pageProps = { snapshot, config, floorsByCode: Object.fromEntries(config.floors.map((f) => [f.code, f])), onNavigate: setPage, onDone: () => setPage("dashboard") };

  return (
    <div className="shell">
      <div className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon" style={{ width: 30, height: 30 }}><Activity size={15} /></div>
          <div style={{ fontWeight: 800, fontSize: 13 }}>Hospital Engine</div>
        </div>
        {!connected && <div className="connection-banner" style={{ borderRadius: 10, marginBottom: 10 }}>Reconnecting…</div>}
        <div className="sidebar-nav">
          <button className="nav-item emergency" onClick={() => setPage("emergency")}><Siren size={16} /> <span>Emergency Patient</span></button>
          {NAV.map((n) => (
            <button key={n.id} className={`nav-item ${page === n.id ? "active" : ""}`} onClick={() => setPage(n.id)}>
              <n.icon size={16} /> <span>{n.label}</span>
              {n.id === "alerts" && alertCount > 0 && <span className="count">{alertCount}</span>}
            </button>
          ))}
        </div>
        <div className="sidebar-foot">
          <div className="admin-chip"><User size={13} /> {username}</div>
          <button className="nav-item" onClick={onLogout}><LogOut size={15} /> <span>Logout</span></button>
        </div>
      </div>
      <div className="content">
        <div className="content-inner">
          {page === "dashboard" && <DashboardPage {...pageProps} />}
          {page === "new-patient" && <NewPatientPage {...pageProps} emergency={false} />}
          {page === "emergency" && <NewPatientPage {...pageProps} emergency={true} />}
          {page === "patients" && <PatientsPage {...pageProps} />}
          {page === "beds" && <BedsRoomsPage {...pageProps} />}
          {page === "alerts" && <AlertsPage {...pageProps} />}
          {page === "resources" && <ResourcesPage {...pageProps} />}
        </div>
        <div className="footer-note">Simulation / decision-support tool only — not an autonomous clinical decision-maker.</div>
      </div>
    </div>
  );
}

export default function App() {
  const [authState, setAuthState] = useState({ checked: false, username: null });
  const checkAuth = useCallback(() => {
    api.me().then((me) => setAuthState({ checked: true, username: me.username })).catch(() => setAuthState({ checked: true, username: null }));
  }, []);
  useEffect(() => { checkAuth(); }, [checkAuth]);

  async function handleLogout() {
    try { await api.logout(); } catch { /* ignore */ }
    setAuthState({ checked: true, username: null });
  }

  if (!authState.checked) return null;
  if (!authState.username) return <LoginScreen onLoggedIn={(u) => setAuthState({ checked: true, username: u })} />;
  return <AppShell username={authState.username} onLogout={handleLogout} />;
}
