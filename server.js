const express = require("express");
const fs = require("fs");
const path = require("path");
const app = express();

// Für Render anpassbar: PORT von Umgebung oder 3000
const PORT = process.env.PORT || 3000;

app.use(express.static("public", { etag: false, lastModified: false, maxAge: 0 }));
app.use(express.json());

// Pfade zu JSON-Dateien
const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const ANSWERS_PATH = path.join(DATA_DIR, "teamAnswers.json");
const CORRECT_PATH = path.join(DATA_DIR, "correctAnswers.json");
const ROUND_PATH = path.join(DATA_DIR, "currentRound.json");
const TEAMS_PATH = path.join(DATA_DIR, "teams.json");
const SCORES_PATH = path.join(DATA_DIR, "scores.json");
const ACCESS_PATH = path.join(DATA_DIR, "accessCode.json");

// Hilfs-Funktionen
function readJsonSafe(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}
function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}

// Defaults anlegen, falls nicht vorhanden
if (!fs.existsSync(ROUND_PATH)) writeJson(ROUND_PATH, { round: 0, locked: false });
if (!fs.existsSync(TEAMS_PATH)) writeJson(TEAMS_PATH, []);
if (!fs.existsSync(ANSWERS_PATH)) writeJson(ANSWERS_PATH, {});
if (!fs.existsSync(CORRECT_PATH)) writeJson(CORRECT_PATH, {});
if (!fs.existsSync(SCORES_PATH)) writeJson(SCORES_PATH, {});
if (!fs.existsSync(ACCESS_PATH)) writeJson(ACCESS_PATH, { code: "QUIZ2025" });

// Beim Serverstart aktuelle Runde auf 0 setzen (locked=false)
writeJson(ROUND_PATH, { round: 0, locked: false });

// Debug
app.get("/__debug", (req, res) => res.send(`Running from: ${__dirname}`));

/* ---------- Access-Code (Zugang) ---------- */
app.get("/access-code", (req, res) => {
  res.json(readJsonSafe(ACCESS_PATH, { code: "" }));
});
app.post("/access-code", (req, res) => {
  const { code } = req.body || {};
  if (typeof code !== "string" || code.trim().length < 3) {
    return res.status(400).send("Ungültiger Code");
  }
  writeJson(ACCESS_PATH, { code: code.trim() });
  res.sendStatus(200);
});

/* ---------- Team-Antworten ---------- */
app.get("/data/teamAnswers.json", (req, res) => {
  res.json(readJsonSafe(ANSWERS_PATH, {}));
});

app.post("/submit-answers", (req, res) => {
  const { teamName, answers, round } = req.body;
  if (!teamName || !Array.isArray(answers) || typeof round !== "number") {
    return res.sendStatus(400);
  }

  const json = readJsonSafe(ANSWERS_PATH, {});
  if (!json[`round_${round}`]) json[`round_${round}`] = {};
  if (!json[`round_${round}`][teamName]) {
    json[`round_${round}`][teamName] = { answers, timestamp: Date.now() };
    writeJson(ANSWERS_PATH, json);
    res.sendStatus(200);
  } else {
    res.sendStatus(409); // schon abgegeben
  }
});

/* ---------- Korrekte Antworten ---------- */
app.get("/correct-answers", (req, res) => {
  res.json(readJsonSafe(CORRECT_PATH, {}));
});

app.post("/save-correct-answers", (req, res) => {
  const json = readJsonSafe(CORRECT_PATH, {});
  json[`round_${req.body.round}`] = req.body.correctAnswers;
  writeJson(CORRECT_PATH, json);
  res.sendStatus(200);
});

// Einzelne richtige Antwort speichern/aktualisieren
app.post("/update-correct-answer", (req, res) => {
  const { round, question, answer } = req.body;
  const json = readJsonSafe(CORRECT_PATH, {});
  if (!json[`round_${round}`]) json[`round_${round}`] = {};
  json[`question_${question}`] = json[`question_${question}`]; // no-op safeguard
  json[`round_${round}`][`question_${question}`] = answer;
  writeJson(CORRECT_PATH, json);
  res.sendStatus(200);
});

/* ---------- Runde ---------- */
app.get("/current-round", (req, res) => {
  res.json(readJsonSafe(ROUND_PATH, { round: 0, locked: false }));
});

app.post("/current-round", (req, res) => {
  const { round, locked } = req.body || {};
  writeJson(ROUND_PATH, { round: Number(round) || 0, locked: !!locked });
  res.sendStatus(200);
});

app.post("/lock-round", (req, res) => {
  const curr = readJsonSafe(ROUND_PATH, { round: 0, locked: false });
  curr.locked = true;
  writeJson(ROUND_PATH, curr);
  res.sendStatus(200);
});

app.post("/unlock-round", (req, res) => {
  const curr = readJsonSafe(ROUND_PATH, { round: 0, locked: false });
  curr.locked = false;
  writeJson(ROUND_PATH, curr);
  res.sendStatus(200);
});

/* ---------- Teams ---------- */
app.get("/teams", (req, res) => {
  res.json(readJsonSafe(TEAMS_PATH, []));
});

// Team registrieren – jetzt nur mit Access-Code erlaubt
app.post("/register-team", (req, res) => {
  const { teamName, accessCode } = req.body;
  if (!teamName || !accessCode) return res.sendStatus(400);

  const expected = readJsonSafe(ACCESS_PATH, { code: "" }).code;
  if (String(accessCode).trim() !== String(expected).trim()) {
    return res.sendStatus(403); // falscher Code
  }

  const json = readJsonSafe(TEAMS_PATH, []);
  if (!json.includes(teamName)) {
    json.push(teamName);
    writeJson(TEAMS_PATH, json);
    res.sendStatus(200);
  } else {
    res.sendStatus(409); // Name schon vergeben
  }
});

/* ---------- Scores ---------- */
app.post("/save-scores", (req, res) => {
  try {
    writeJson(SCORES_PATH, req.body || {});
    res.send("Gespeichert");
  } catch (e) {
    console.error("Fehler beim Speichern der Punkte:", e);
    res.status(500).send("Fehler");
  }
});

app.get("/scores", (req, res) => {
  res.json(readJsonSafe(SCORES_PATH, {}));
});

/* ---------- Server ---------- */
app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
});