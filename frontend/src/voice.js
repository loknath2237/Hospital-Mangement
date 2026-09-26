import { SEVERITY_LABEL, URGENCY_LABEL, MONITORING_LABEL } from "./lib";

const CONDITIONS = ["Cardiac event", "Respiratory distress", "Trauma / fracture", "Post-surgical recovery", "Infection / sepsis risk", "Stable observation", "Neurological event", "General weakness"];
const EQUIPMENT_OPTIONS = ["VENTILATOR", "CARDIAC_MONITOR", "DEFIBRILLATOR", "DIALYSIS", "INFUSION_PUMP", "TRACTION", "OXYGEN_SUPPLY"];
const prettyEquip = (t) => t.replace(/_/g, " ").toLowerCase();

// ---------------------------------------------------------------- numbers --
const ONES = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

// Parses a spoken number phrase ("thirty two", "forty-five", "7", "seven") into an integer, or null.
export function wordsToNumber(text) {
  if (!text) return null;
  const clean = text.toLowerCase().trim();
  const digitMatch = clean.match(/\d+/);
  if (digitMatch) return parseInt(digitMatch[0], 10);

  const words = clean.replace(/-/g, " ").split(/\s+/).filter(Boolean);
  let total = null;
  let hundred = false;
  for (const w of words) {
    if (w === "and") continue;
    if (w === "hundred") { total = (total || 1) * 100; hundred = true; continue; }
    if (w in TENS) { total = (total || 0) + TENS[w]; continue; }
    if (w in ONES) { total = (total || 0) + ONES[w]; continue; }
  }
  return total;
}

// ------------------------------------------------------------ field model --
// Each field: keys (spoken aliases, longest-first matters for detection),
// type controls how the *value* utterance gets parsed.
export const VOICE_FIELDS = [
  { field: "name", keys: ["patient name", "name"], type: "text" },
  { field: "age", keys: ["age"], type: "number", min: 0, max: 110 },
  { field: "condition", keys: ["condition"], type: "enum", options: CONDITIONS },
  { field: "injurySeverity", keys: ["injury severity", "severity"], type: "scale", labels: SEVERITY_LABEL },
  { field: "doctorUrgency", keys: ["doctor urgency", "urgency"], type: "scale", labels: URGENCY_LABEL },
  { field: "requiredMonitoring", keys: ["monitoring level", "monitoring needed", "monitoring"], type: "scale", labels: MONITORING_LABEL },
  { field: "mobility", keys: ["mobility"], type: "enum", options: ["Independent", "Assisted", "Bedridden"] },
  { field: "expectedLOS", keys: ["length of stay", "expected stay", "days", "stay"], type: "number", min: 1, max: 60 },
  { field: "emergency", keys: ["emergency status", "critical status", "emergency"], type: "boolean" },
  { field: "icuRequired", keys: ["icu required", "icu"], type: "boolean" },
  { field: "isolationRequired", keys: ["isolation required", "isolation"], type: "boolean" },
  { field: "otRequired", keys: ["operating theatre", "surgery required", "surgery", "ot"], type: "boolean" },
  { field: "equipmentRequired", keys: ["special equipment", "equipment"], type: "equipment" },
].map((f) => ({ ...f, keys: [...f.keys].sort((a, b) => b.length - a.length) }));

const YES_WORDS = ["yes", "yeah", "yep", "true", "required", "needed", "on"];
const NO_WORDS = ["no", "nope", "false", "not required", "none", "off"];

// Scans a transcript for a field keyword. Returns { field, type, remainder } or null.
// remainder is whatever text follows the keyword, e.g. "age thirty" -> remainder "thirty".
export function matchField(transcript) {
  const clean = transcript.toLowerCase().trim();
  let best = null;
  for (const f of VOICE_FIELDS) {
    for (const key of f.keys) {
      const idx = clean.indexOf(key);
      if (idx === -1) continue;
      if (!best || key.length > best.key.length) {
        const remainder = (clean.slice(0, idx) + " " + clean.slice(idx + key.length)).trim();
        best = { field: f.field, type: f.type, key, remainder, def: f };
      }
    }
  }
  return best;
}

function fuzzyMatchOption(text, options) {
  const clean = text.toLowerCase().trim();
  if (!clean) return null;
  const exact = options.find((o) => o.toLowerCase() === clean);
  if (exact) return exact;
  const contains = options.find((o) => o.toLowerCase().includes(clean) || clean.includes(o.toLowerCase()));
  return contains || null;
}

// Parses a value utterance for a given field definition. Returns { ok, value, display } or { ok: false }.
export function parseValue(def, transcript) {
  const clean = transcript.toLowerCase().trim();
  if (!clean) return { ok: false };

  if (def.type === "text") {
    return { ok: true, value: transcript.trim(), display: transcript.trim() };
  }

  if (def.type === "number") {
    const n = wordsToNumber(clean);
    if (n === null || Number.isNaN(n)) return { ok: false };
    const clamped = Math.max(def.min, Math.min(def.max, n));
    return { ok: true, value: clamped, display: String(clamped) };
  }

  if (def.type === "scale") {
    // try a plain-language label first ("severe", "high", "self-care")...
    const entries = Object.entries(def.labels);
    const byLabel = entries.find(([, label]) => clean.includes(label.toLowerCase()) || label.toLowerCase().includes(clean));
    if (byLabel) return { ok: true, value: Number(byLabel[0]), display: byLabel[1] };
    // ...otherwise fall back to a spoken number within the valid range.
    const n = wordsToNumber(clean);
    const keys = entries.map(([k]) => Number(k));
    if (n !== null && keys.includes(n)) return { ok: true, value: n, display: def.labels[n] };
    return { ok: false };
  }

  if (def.type === "enum") {
    const match = fuzzyMatchOption(clean, def.options);
    if (!match) return { ok: false };
    return { ok: true, value: match, display: match };
  }

  if (def.type === "boolean") {
    if (NO_WORDS.some((w) => clean.includes(w))) return { ok: true, value: false, display: "No" };
    if (YES_WORDS.some((w) => clean.includes(w))) return { ok: true, value: true, display: "Yes" };
    return { ok: false };
  }

  if (def.type === "equipment") {
    const match = EQUIPMENT_OPTIONS.find((tag) => clean.includes(prettyEquip(tag)) || prettyEquip(tag).includes(clean));
    if (!match) return { ok: false };
    return { ok: true, value: match, display: prettyEquip(match) };
  }

  return { ok: false };
}

// Top-level entry point used by the UI. Given the current awaited field (or
// null if idle) and a fresh final transcript, decides what happened:
//   { action: "set", field, value, display, next: null }        -> field filled, back to idle
//   { action: "awaiting", field, display }                      -> field named, now needs a value
//   { action: "unrecognized-field" }                             -> idle, but no field keyword found
//   { action: "unrecognized-value", field }                      -> value didn't parse, keep awaiting same field
export function processVoiceTranscript(transcript, awaitingField) {
  if (awaitingField) {
    const def = VOICE_FIELDS.find((f) => f.field === awaitingField);
    const result = parseValue(def, transcript);
    if (result.ok) return { action: "set", field: awaitingField, value: result.value, display: result.display };
    // allow switching fields mid-flow instead of forcing a value
    const switched = matchField(transcript);
    if (switched) return handleFieldMatch(switched);
    return { action: "unrecognized-value", field: awaitingField };
  }
  const matched = matchField(transcript);
  if (!matched) return { action: "unrecognized-field" };
  return handleFieldMatch(matched);
}

function handleFieldMatch(matched) {
  if (matched.remainder) {
    const result = parseValue(matched.def, matched.remainder);
    if (result.ok) return { action: "set", field: matched.field, value: result.value, display: result.display };
  }
  return { action: "awaiting", field: matched.field };
}
