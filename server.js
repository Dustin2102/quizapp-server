const express = require("express");
const fs = require("fs");
const path = require("path");
const app = express();

const PORT = process.env.PORT || 3000;

app.use(express.static("public", { etag: false, lastModified: false, maxAge: 0 }));
app.use(express.json());

// Pfade
const DATA_DIR    = path.join(__dirname, "data");
const ANSWERS_PATH= path.join(DATA_DIR, "teamAnswers.json");
const CORRECT_PATH= path.join(DATA_DIR, "correctAnswers.json");
const ROUND_PATH  = path.join(DATA_DIR, "currentRound.json");
const TEAMS_PATH  = path.join(DATA_DIR, "teams.json");
const SCORES_PATH = path.join(DATA_DIR, "scores.json");

// Utils
function safeRead(file, fallback) {
  try {
    const raw = fs.readFileSync(file, "utf8");
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function safeWrite(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}
function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
}
ensureDir();

// ---- GETs liefern IMMER gültiges JSON ----
app.get("/data/teamAnswers.json", (req, res) => {
  const data = safeRead(ANSWERS_PATH, {});
  res.json(data);
});

app.get("/correct-answers", (req, res) => {
  const data = safeRead(CORRECT_PATH, {});
  res.json(data);
});

app.get("/current-round", (req, res) => {
  const data = safeRead(ROUND_PATH, { round: 0, closed: false });
  // sanity
  const round = Number.isFinite(+data.round) ? +data.round : 0;
  const closed = !!data.closed;
  res.json({ round, closed });
});

app.get("/teams", (req, res) => {
  const data = safeRead(TEAMS_PATH, []);
  res.json(data);
});

app.get("/scores", (req, res) => {
  const data = safeRead(SCORES_PATH, {});
  res.json(data);
});

// ---- Antworten absenden ----
app.post("/submit-answers", (req, res) => {
  const { teamName, answers, round } = req.body;
  if (!teamName || !Array.isArray(answers)) return res.status(400).send("Bad payload");

  // Runde prüfen (geschlossen oder nicht?)
  const roundState = safeRead(ROUND_PATH, { round: 0, closed: false });
  if (roundState.closed || roundState.round !== round) {
    return res.status(423).send("Round not open");
  }

  const data = safeRead(ANSWERS_PATH, {});
  const key = `round_${round}`;
  if (!data[key]) data[key] = {};
  if (data[key][teamName]) return res.sendStatus(409);

  data[key][teamName] = { answers, timestamp: Date.now() };
  safeWrite(ANSWERS_PATH, data);
  res.sendStatus(200);
});

// ---- Korrekte Antworten speichern (ganze Runde) ----
function toObjectFormat(payload) {
  // akzeptiert Array ODER Objekt; gibt Objekt mit question_# => string zurück
  if (Array.isArray(payload)) {
    const obj = {};
    payload.forEach((v, i) => { obj[`question_${i + 1}`] = v ?? ""; });
    return obj;
  }
  if (payload && typeof payload === "object") {
    // falls numerische Keys 0..11 kommen, auch umwandeln
    const obj = {};
    const keys = Object.keys(payload);
    const isNumeric = keys.every(k => String(+k) === k);
    if (isNumeric) {
      keys.sort((a,b)=>+a-+b).forEach((k, idx) => { obj[`question_${idx + 1}`] = payload[k] ?? ""; });
      return obj;
    }
    return payload; // already question_#
  }
  return {};
}

app.post("/save-correct-answers", (req, res) => {
  const { round, correctAnswers } = req.body;
  const r = Number(round);
  if (!Number.isFinite(r) || r < 1) return res.status(400).send("round missing");

  const store = safeRead(CORRECT_PATH, {});
  store[`round_${r}`] = toObjectFormat(correctAnswers);
  safeWrite(CORRECT_PATH, store);
  res.sendStatus(200);
});

// ---- Einzelne richtige Antwort aktualisieren ----
app.post("/update-correct-answer", (req, res) => {
  const { round, question, answer } = req.body;
  const r = Number(round), q = Number(question);
  if (!Number.isFinite(r) || !Number.isFinite(q)) return res.status(400).send("bad payload");

  const store = safeRead(CORRECT_PATH, {});
  if (!store[`round_${r}`]) store[`round_${r}`] = {};
  store[`round_${r}`][`question_${q}`] = answer ?? "";
  safeWrite(CORRECT_PATH, store);
  res.sendStatus(200);
});

// ---- Runde setzen (inkl. closed) ----
app.post("/current-round", (req, res) => {
  const prev = safeRead(ROUND_PATH, { round: 0, closed: false });
  const round = Number.isFinite(+req.body.round) ? +req.body.round : prev.round;
  const closed = typeof req.body.closed === "boolean" ? req.body.closed : prev.closed;
  safeWrite(ROUND_PATH, { round, closed });
  res.sendStatus(200);
});

// ---- Team registrieren ----
app.post("/register-team", (req, res) => {
  const { teamName } = req.body;
  if (!teamName || !String(teamName).trim()) return res.status(400).send("teamName missing");

  const list = safeRead(TEAMS_PATH, []);
  if (list.includes(teamName)) return res.sendStatus(409);
  list.push(teamName);
  safeWrite(TEAMS_PATH, list);
  res.sendStatus(200);
});

// ---- Scores speichern/holen ----
app.post("/save-scores", (req, res) => {
  try {
    safeWrite(SCORES_PATH, req.body || {});
    res.send("Gespeichert");
  } catch (e) {
    console.error(e);
    res.status(500).send("Fehler");
  }
});

// ---- Reset für neue Session ----
app.post("/reset-teams", (req, res) => {
  try {
    safeWrite(TEAMS_PATH, []);
    safeWrite(ANSWERS_PATH, {});
    safeWrite(SCORES_PATH, {});
    safeWrite(ROUND_PATH, { round: 0, closed: false });
    res.send("Zurückgesetzt");
  } catch (e) {
    console.error(e);
    res.status(500).send("Fehler beim Zurücksetzen");
  }
});

// Debug
app.get("/__debug-round", (req, res) => {
  res.json(safeRead(ROUND_PATH, { round: 0, closed: false }));
});

app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
});