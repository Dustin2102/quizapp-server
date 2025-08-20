/**
 * Quiz-Server – Express
 * Features:
 * - Static /public (no-cache)
 * - Team-Registration, Round-State (round, closed)
 * - Submit Answers (blockt wenn closed/andere Runde)
 * - Correct Answers: speichern (Runde), aktualisieren (einzelne Frage)
 * - Scores speichern/lesen
 * - Reset (Teams, Answers, Scores, Round) – CORRECT bleibt erhalten
 * - Robust gegen altes Array-Format bei correctAnswers
 */

const express = require("express");
const fs = require("fs");
const path = require("path");
const app = express();

const PORT = process.env.PORT || 3000;

// Static: no cache, damit Admin/Team sofort neue UI/JS sehen
app.use(
  express.static("public", {
    etag: false,
    lastModified: false,
    maxAge: 0,
    cacheControl: true,
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.setHeader("Surrogate-Control", "no-store");
    },
  })
);
app.use(express.json());

// Pfade
const DATA_DIR = path.join(__dirname, "data");
const ANSWERS_PATH = path.join(DATA_DIR, "teamAnswers.json");
const CORRECT_PATH = path.join(DATA_DIR, "correctAnswers.json");
const ROUND_PATH = path.join(DATA_DIR, "currentRound.json");
const TEAMS_PATH = path.join(DATA_DIR, "teams.json");
const SCORES_PATH = path.join(DATA_DIR, "scores.json");

// Utils
function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
function ensureFile(filePath, defaultData) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
  }
}
function safeRead(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function safeWrite(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2));
}
function toObjectFormat(payload) {
  // akzeptiert Array, Objekt (question_#), oder numerische Keys -> Objekt mit question_#
  if (Array.isArray(payload)) {
    const obj = {};
    payload.forEach((v, i) => (obj[`question_${i + 1}`] = v ?? ""));
    return obj;
  }
  if (payload && typeof payload === "object") {
    const keys = Object.keys(payload);
    const numeric = keys.length > 0 && keys.every((k) => String(+k) === k);
    if (numeric) {
      const obj = {};
      keys
        .map((k) => +k)
        .sort((a, b) => a - b)
        .forEach((num, idx) => (obj[`question_${idx + 1}`] = payload[String(num)] ?? ""));
      return obj;
    }
    return payload; // already {question_#}
  }
  return {};
}

// Init
ensureDir(DATA_DIR);
ensureFile(ANSWERS_PATH, {}); // { round_1: { Team: {answers:[], timestamp} }, ... }
ensureFile(CORRECT_PATH, {}); // { round_1: { question_1: "Antwort; Var2", ... }, ... }
ensureFile(ROUND_PATH, { round: 0, closed: false });
ensureFile(TEAMS_PATH, []); // [ "Team A", "Team B" ]
ensureFile(SCORES_PATH, {}); // { Team: { "Runde 1": n, ... } }

// ---------- GET: liefern IMMER JSON ----------
app.get("/data/teamAnswers.json", (req, res) => {
  res.json(safeRead(ANSWERS_PATH, {}));
});

app.get("/correct-answers", (req, res) => {
  res.json(safeRead(CORRECT_PATH, {}));
});

app.get("/current-round", (req, res) => {
  const d = safeRead(ROUND_PATH, { round: 0, closed: false });
  const round = Number.isFinite(+d.round) ? +d.round : 0;
  const closed = !!d.closed;
  res.json({ round, closed });
});

app.get("/teams", (req, res) => {
  res.json(safeRead(TEAMS_PATH, []));
});

app.get("/scores", (req, res) => {
  res.json(safeRead(SCORES_PATH, {}));
});

// ---------- POST: Submit Answers ----------
app.post("/submit-answers", (req, res) => {
  const { teamName, answers, round } = req.body;
  if (!teamName || !Array.isArray(answers) || !Number.isFinite(+round)) {
    return res.status(400).send("bad payload");
  }

  // Runde/closed prüfen
  const roundState = safeRead(ROUND_PATH, { round: 0, closed: false });
  if (roundState.closed || +roundState.round !== +round || round < 1 || round > 6) {
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

// ---------- POST: Save Correct Answers (ganze Runde) ----------
app.post("/save-correct-answers", (req, res) => {
  const { round, correctAnswers } = req.body || {};
  const r = Number(round);
  if (!Number.isFinite(r) || r < 1) return res.status(400).send("round missing");

  const store = safeRead(CORRECT_PATH, {});
  store[`round_${r}`] = toObjectFormat(correctAnswers);
  safeWrite(CORRECT_PATH, store);
  res.sendStatus(200);
});

// ---------- POST: Update single correct answer (Fix: immer Objektformat) ----------
app.post("/update-correct-answer", (req, res) => {
  const { round, question, answer } = req.body || {};
  const r = Number(round),
    q = Number(question);
  if (!Number.isFinite(r) || !Number.isFinite(q)) return res.status(400).send("bad payload");

  const store = safeRead(CORRECT_PATH, {});
  const keyR = `round_${r}`;
  let roundData = store[keyR];

  // Normalize zu Objekt
  if (Array.isArray(roundData)) {
    const obj = {};
    roundData.forEach((v, i) => (obj[`question_${i + 1}`] = v ?? ""));
    roundData = obj;
  } else if (!roundData || typeof roundData !== "object") {
    roundData = {};
  }

  roundData[`question_${q}`] = answer ?? "";
  store[keyR] = roundData;
  safeWrite(CORRECT_PATH, store);
  res.sendStatus(200);
});

// ---------- POST: Set current round (inkl. closed) ----------
app.post("/current-round", (req, res) => {
  const prev = safeRead(ROUND_PATH, { round: 0, closed: false });
  const round = Number.isFinite(+req.body.round) ? +req.body.round : prev.round;
  const closed = typeof req.body.closed === "boolean" ? req.body.closed : prev.closed;
  safeWrite(ROUND_PATH, { round, closed });
  res.sendStatus(200);
});

// ---------- POST: Register team ----------
app.post("/register-team", (req, res) => {
  const { teamName } = req.body || {};
  const name = String(teamName || "").trim();
  if (!name) return res.status(400).send("teamName missing");

  const list = safeRead(TEAMS_PATH, []);
  if (list.includes(name)) return res.sendStatus(409);
  list.push(name);
  safeWrite(TEAMS_PATH, list);
  res.sendStatus(200);
});

// ---------- POST: Save scores (gesamtes Objekt) ----------
app.post("/save-scores", (req, res) => {
  try {
    const payload = req.body && typeof req.body === "object" ? req.body : {};
    safeWrite(SCORES_PATH, payload);
    res.send("Gespeichert");
  } catch (e) {
    console.error("Fehler beim Speichern der Punkte:", e);
    res.status(500).send("Fehler");
  }
});

// ---------- POST: Reset (Teams, Answers, Scores leeren; Round -> 0) ----------
app.post("/reset-teams", (req, res) => {
  try {
    safeWrite(TEAMS_PATH, []);
    safeWrite(ANSWERS_PATH, {});
    safeWrite(SCORES_PATH, {});
    safeWrite(ROUND_PATH, { round: 0, closed: false });
    // CORRECT_PATH absichtlich NICHT gelöscht
    res.send("Zurückgesetzt");
  } catch (e) {
    console.error("Fehler beim Zurücksetzen:", e);
    res.status(500).send("Fehler beim Zurücksetzen");
  }
});

// ---------- Optional: Debug ----------
app.get("/__debug-round", (req, res) => {
  res.json(safeRead(ROUND_PATH, { round: 0, closed: false }));
});

// Start
app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
});