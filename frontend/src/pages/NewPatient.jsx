import React, { useState, useRef, useEffect, useCallback } from "react";
import { Siren, Stethoscope, CheckCircle2, Clock3, ArrowLeft, Mic, MicOff } from "lucide-react";
import { api } from "../api";
import { CLASS_LABEL, SEVERITY_LABEL, URGENCY_LABEL, MONITORING_LABEL } from "../lib";
import { processVoiceTranscript, VOICE_FIELDS } from "../voice";

const CONDITIONS = ["Cardiac event", "Respiratory distress", "Trauma / fracture", "Post-surgical recovery", "Infection / sepsis risk", "Stable observation", "Neurological event", "General weakness"];
const EQUIPMENT_OPTIONS = ["VENTILATOR", "CARDIAC_MONITOR", "DEFIBRILLATOR", "DIALYSIS", "INFUSION_PUMP", "TRACTION", "OXYGEN_SUPPLY"];
const prettyEquip = (t) => t.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

const FIELD_LABEL = { name: "Name", age: "Age", condition: "Condition", injurySeverity: "Injury Severity", doctorUrgency: "Doctor Urgency", requiredMonitoring: "Monitoring Needed", mobility: "Mobility", expectedLOS: "Length of Stay", emergency: "Emergency Status", icuRequired: "ICU Required", isolationRequired: "Isolation Required", otRequired: "OT / Surgery Required", equipmentRequired: "Equipment" };
const VOICE_FIELD_NAMES = VOICE_FIELDS.map((f) => f.keys[f.keys.length - 1]).join(", ");

function defaultForm(emergency) {
  return {
    name: "", age: "", condition: CONDITIONS[0], injurySeverity: emergency ? 4 : 2, doctorUrgency: emergency ? 4 : 2,
    requiredMonitoring: emergency ? 3 : 1, mobility: "Independent", expectedLOS: 3,
    emergency, icuRequired: false, isolationRequired: false, otRequired: false, equipmentRequired: [],
  };
}

function useVoiceFill(set) {
  const [supported] = useState(() => typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition));
  const [listening, setListening] = useState(false);
  const [awaitingField, setAwaitingField] = useState(null);
  const [status, setStatus] = useState("");
  const recognitionRef = useRef(null);
  const awaitingRef = useRef(null);
  awaitingRef.current = awaitingField;

  const applyValue = useCallback((field, value) => {
    if (field === "equipmentRequired") {
      set((f) => (f.equipmentRequired.includes(value) ? f : { ...f, equipmentRequired: [...f.equipmentRequired, value] }));
      return;
    }
    set((f) => ({ ...f, [field]: value }));
  }, [set]);

  const handleTranscript = useCallback((transcript) => {
    const result = processVoiceTranscript(transcript, awaitingRef.current);
    if (result.action === "set") {
      applyValue(result.field, result.value);
      setAwaitingField(null);
      setStatus(`Heard "${transcript}" → set ${FIELD_LABEL[result.field] || result.field} to ${result.display}`);
    } else if (result.action === "awaiting") {
      setAwaitingField(result.field);
      setStatus(`Field: ${FIELD_LABEL[result.field] || result.field} — now say the value`);
    } else if (result.action === "unrecognized-value") {
      setStatus(`Didn't catch a value for ${FIELD_LABEL[result.field] || result.field} — try again`);
    } else {
      setStatus(`Didn't recognize a field name in "${transcript}" — try saying one of: ${VOICE_FIELD_NAMES}`);
    }
  }, [applyValue]);

  useEffect(() => {
    if (!supported) return undefined;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      if (result && result.isFinal) handleTranscript(result[0].transcript.trim());
    };
    recognition.onerror = (event) => {
      if (event.error === "no-speech") return;
      setStatus(event.error === "not-allowed" ? "Microphone access denied — allow it in your browser settings." : `Voice error: ${event.error}`);
      if (event.error === "not-allowed") setListening(false);
    };
    recognition.onend = () => {
      // browsers auto-stop after a period of silence — restart automatically while still "on"
      if (recognitionRef.current === recognition && recognitionRef.current.__wantListening) {
        try { recognition.start(); } catch { /* already starting */ }
      }
    };
    recognitionRef.current = recognition;
    return () => { recognition.onend = null; recognition.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported, handleTranscript]);

  const toggle = () => {
    if (!recognitionRef.current) return;
    if (listening) {
      recognitionRef.current.__wantListening = false;
      recognitionRef.current.stop();
      setListening(false);
      setAwaitingField(null);
      setStatus("");
    } else {
      recognitionRef.current.__wantListening = true;
      try { recognitionRef.current.start(); } catch { /* ignore if already started */ }
      setListening(true);
      setStatus(`Listening — say a field name (${VOICE_FIELD_NAMES})`);
    }
  };

  return { supported, listening, awaitingField, status, toggle };
}

export default function NewPatientPage({ emergency, floorsByCode, onDone }) {
  const [form, setForm] = useState(() => defaultForm(emergency));
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const set = (patch) => setForm((f) => (typeof patch === "function" ? patch(f) : { ...f, ...patch }));
  const voice = useVoiceFill(set);

  async function handleSubmit() {
    if (!form.age) { setError("Please enter the patient's age."); return; }
    setError(""); setSubmitting(true);
    try {
      const payload = { ...form, age: Number(form.age), expectedLOS: Number(form.expectedLOS) };
      const res = await api.addPatient(payload);
      setResult(res);
    } catch (e) {
      setError(e.message || "Something went wrong while allocating this patient.");
    } finally { setSubmitting(false); }
  }

  if (result) {
    const { patient, resource } = result;
    const allocated = patient.status === "ADMITTED" && resource;
    const floor = resource ? floorsByCode[resource.floor] : null;
    return (
      <div>
        <div className="result-card">
          <div className={allocated ? "result-icon-ok" : "result-icon-wait"}>
            {allocated ? <CheckCircle2 size={26} /> : <Clock3 size={26} />}
          </div>
          <div className="result-title">{allocated ? "Patient Allocated" : "Added to Queue"}</div>
          <div className="result-patient">{patient.name ? `${patient.name} (${patient.id})` : patient.id} &middot; {CLASS_LABEL[patient.clinicalClass]} priority</div>
          {allocated ? (
            <>
              <div className="result-grid">
                <div className="result-item"><div className="k">Floor</div><div className="v">{floor?.name || resource.floor}</div></div>
                <div className="result-item"><div className="k">Room / Bed</div><div className="v">{resource.id}</div></div>
                <div className="result-item"><div className="k">Care Level</div><div className="v">{floor?.careLevel || "—"}</div></div>
                <div className="result-item"><div className="k">ICU</div><div className="v">{resource.is_ICU ? "Yes — ICU bed" : "Not required"}</div></div>
                <div className="result-item"><div className="k">OT</div><div className="v">{resource.is_OT ? "Yes — in surgery" : "Not required"}</div></div>
                <div className="result-item"><div className="k">Isolation</div><div className="v">{form.isolationRequired ? "Yes" : "No"}</div></div>
              </div>
              <div className="result-reason"><strong>Status:</strong> Confirmed<br /><strong>Reason:</strong> Best feasible resource based on this patient's requirements and current hospital availability.</div>
            </>
          ) : (
            <div className="result-reason">No suitable resource is available right now — this patient has been added to the priority queue and will be allocated automatically the moment a matching bed, ICU slot, or OT opens up. You can track them on the <strong>Patients</strong> page.</div>
          )}
        </div>
        <div className="row" style={{ justifyContent: "center", marginTop: 16 }}>
          <button className="btn btn-solid" onClick={() => { setResult(null); setForm(defaultForm(emergency)); }}>Register Another Patient</button>
          <button className="btn" onClick={onDone}><ArrowLeft size={13} /> Back to Dashboard</button>
        </div>
      </div>
    );
  }

  return (
    <div className="panel" style={{ maxWidth: 720 }}>
      {error && <div className="login-error">{error}</div>}

      {voice.supported && (
        <div className="voice-bar">
          <button type="button" className={`voice-toggle ${voice.listening ? "active" : ""}`} onClick={voice.toggle}>
            {voice.listening ? <Mic size={14} /> : <MicOff size={14} />} {voice.listening ? "Listening…" : "Voice Fill"}
          </button>
          {voice.status && <span className="voice-status">{voice.status}</span>}
        </div>
      )}

      <div className="form-grid">
        <label className={`field ${voice.awaitingField === "name" ? "voice-active" : ""}`}>Patient Name
          <input type="text" value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Ramesh Kumar (optional)" />
        </label>
        <label className={`field ${voice.awaitingField === "age" ? "voice-active" : ""}`}>Age
          <input type="number" min={0} max={110} value={form.age} onChange={(e) => set({ age: e.target.value })} placeholder="e.g. 54" />
        </label>
        <label className={`field ${voice.awaitingField === "condition" ? "voice-active" : ""}`}>Condition
          <select className="select" style={{ width: "100%" }} value={form.condition} onChange={(e) => set({ condition: e.target.value })}>
            {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className={`field ${voice.awaitingField === "injurySeverity" ? "voice-active" : ""}`}>Injury Severity
          <select className="select" style={{ width: "100%" }} value={form.injurySeverity} onChange={(e) => set({ injurySeverity: Number(e.target.value) })}>
            {Object.entries(SEVERITY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className={`field ${voice.awaitingField === "doctorUrgency" ? "voice-active" : ""}`}>Doctor-Assigned Urgency
          <select className="select" style={{ width: "100%" }} value={form.doctorUrgency} onChange={(e) => set({ doctorUrgency: Number(e.target.value) })}>
            {Object.entries(URGENCY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className={`field ${voice.awaitingField === "requiredMonitoring" ? "voice-active" : ""}`}>Monitoring Needed
          <select className="select" style={{ width: "100%" }} value={form.requiredMonitoring} onChange={(e) => set({ requiredMonitoring: Number(e.target.value) })}>
            {Object.entries(MONITORING_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className={`field ${voice.awaitingField === "mobility" ? "voice-active" : ""}`}>Mobility
          <select className="select" style={{ width: "100%" }} value={form.mobility} onChange={(e) => set({ mobility: e.target.value })}>
            <option>Independent</option><option>Assisted</option><option>Bedridden</option>
          </select>
        </label>
        <label className={`field ${voice.awaitingField === "expectedLOS" ? "voice-active" : ""}`}>Expected Length of Stay (days)
          <input type="number" min={1} max={60} value={form.expectedLOS} onChange={(e) => set({ expectedLOS: e.target.value })} />
        </label>
        <div className="field" style={{ justifyContent: "center", gap: 10 }}>
          <label className={`checkbox-row ${voice.awaitingField === "emergency" ? "voice-active" : ""}`}><input type="checkbox" checked={form.emergency} onChange={(e) => set({ emergency: e.target.checked })} /> Emergency / critical status</label>
          <label className={`checkbox-row ${voice.awaitingField === "icuRequired" ? "voice-active" : ""}`}><input type="checkbox" checked={form.icuRequired} onChange={(e) => set({ icuRequired: e.target.checked })} /> ICU required</label>
          <label className={`checkbox-row ${voice.awaitingField === "isolationRequired" ? "voice-active" : ""}`}><input type="checkbox" checked={form.isolationRequired} onChange={(e) => set({ isolationRequired: e.target.checked })} /> Isolation required</label>
          <label className={`checkbox-row ${voice.awaitingField === "otRequired" ? "voice-active" : ""}`}><input type="checkbox" checked={form.otRequired} onChange={(e) => set({ otRequired: e.target.checked })} /> OT / surgery required</label>
        </div>
      </div>
      <div style={{ marginTop: 16 }} className={voice.awaitingField === "equipmentRequired" ? "voice-active" : ""}>
        <div className="field" style={{ marginBottom: 8 }}>Special Equipment Required</div>
        <div className="row">
          {EQUIPMENT_OPTIONS.map((tag) => {
            const active = form.equipmentRequired.includes(tag);
            return <button key={tag} type="button" className={`equip-toggle ${active ? "active" : ""}`} onClick={() => set({ equipmentRequired: active ? form.equipmentRequired.filter((t) => t !== tag) : [...form.equipmentRequired, tag] })}>{prettyEquip(tag)}</button>;
          })}
        </div>
      </div>
      <button className="submit-btn" disabled={submitting} onClick={handleSubmit} style={emergency ? { background: "#f43f5e" } : undefined}>
        {emergency ? <Siren size={16} /> : <Stethoscope size={16} />}
        {submitting ? "Allocating…" : emergency ? "Allocate Emergency Patient" : "Allocate Patient"}
      </button>
    </div>
  );
}
