/**
 * Quiz-Server – Express
 * Features:
 * - Static /public (no-cache)
 * - Team-Registration, Round-State (round, closed)
 * - Submit Answers (blockt wenn closed/andere Runde)
 * - Correct Answers: speichern (Runde), aktualisieren (einzelne Frage)
 * - Scores speichern/lesen
 * - Reset (Teams, Answers, Scores, Round) – CORRECT bleibt erhalten
 * - BasicAuth-Schutz für /admin.html und Admin-APIs
 * - Heartbeat + aktive Teams
 * - NEU: /admin/remove-team entfernt Team überall (Teams, Tokens, Answers, Scores)
 */

const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const app = express();

const PORT = process.env.PORT || 3000;

// ==== Admin Zugangsdaten (fix) ====
const ADMIN_USER = "admin";
const ADMIN_PASSWORD = "Schildkröte@21"; // <- dein Passwort

// ==== Middleware Basic Auth ====
function basicAuth(req, res, next) {
  const b64auth = (req.headers.authorization || "").split(" ")[1] || "";
  const [user, pass] = Buffer.from(b64auth, "base64").toString().split(":");
  if (user && pass && user === ADMIN_USER && pass === ADMIN_PASSWORD) return next();
  res.set("WWW-Authenticate", 'Basic realm="Admin Bereich"');
  res.status(401).send("Authentifizierung erforderlich");
}

app.use(express.json());

// Pfade
const DATA_DIR = path.join(__dirname, "data");
const ANSWERS_PATH = path.join(DATA_DIR, "teamAnswers.json");   // { round_1: { Team: {answers:[], timestamp} }, ... }
const CORRECT_PATH = path.join(DATA_DIR, "correctAnswers.json");// { round_1: { question_1: "…" } }
const ROUND_PATH = path.join(DATA_DIR, "currentRound.json");    // { round, closed }
const TEAMS_PATH = path.join(DATA_DIR, "teams.json");           // [ "Team A", ... ]
const SCORES_PATH = path.join(DATA_DIR, "scores.json");         // { Team: { "Runde 1": n, ... } }
const TEAM_TOKENS_PATH = path.join(DATA_DIR, "teamTokens.json");// { tokens:{tok:{teamName,lastSeen,pageHidden}}, byName:{team:tok} }

// Utils
function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
function ensureFile(filePath, defaultData) {
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
}
function safeRead(filePath, fallback) {
  try { const raw = fs.readFileSync(filePath, "utf8"); return raw ? JSON.parse(raw) : fallback; }
  catch { return fallback; }
}
function safeWrite(filePath, obj) { fs.writeFileSync(filePath, JSON.stringify(obj, null, 2)); }
function randomTokenHex(n = 24) { return crypto.randomBytes(n).toString("hex"); }

// Init
ensureDir(DATA_DIR);
ensureFile(ANSWERS_PATH, {});
ensureFile(CORRECT_PATH, {});
ensureFile(ROUND_PATH, { round: 0, closed: false });
ensureFile(TEAMS_PATH, []);
ensureFile(SCORES_PATH, {});
ensureFile(TEAM_TOKENS_PATH, { tokens:{}, byName:{} });

// ---------- GET: liefern IMMER JSON ----------
app.get("/data/teamAnswers.json", (req, res) => { res.json(safeRead(ANSWERS_PATH, {})); });
app.get("/correct-answers", (req, res) => { res.json(safeRead(CORRECT_PATH, {})); });
app.get("/current-round", (req, res) => {
  const d = safeRead(ROUND_PATH, { round: 0, closed: false });
  const round = Number.isFinite(+d.round) ? +d.round : 0;
  const closed = !!d.closed;
  res.json({ round, closed });
});
app.get("/teams", (req, res) => { res.json(safeRead(TEAMS_PATH, [])); });
app.get("/scores", (req, res) => { res.json(safeRead(SCORES_PATH, {})); });

// ---------- POST: Submit Answers (Teams) ----------
app.post("/submit-answers", (req, res) => {
  const { teamName, answers, round } = req.body;
  if (!teamName || !Array.isArray(answers) || !Number.isFinite(+round)) {
    return res.status(400).send("bad payload");
  }
  const roundState = safeRead(ROUND_PATH, { round: 0, closed: false });
  if (roundState.closed || +roundState.round !== +round || round < 1 || round > 10) {
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

// ---------- Admin: korrekte Antworten ----------
app.post("/save-correct-answers", basicAuth, (req, res) => {
  const { round, correctAnswers } = req.body || {};
  const r = Number(round);
  if (!Number.isFinite(r) || r < 1) return res.status(400).send("round missing");
  const store = safeRead(CORRECT_PATH, {});
  store[`round_${r}`] = correctAnswers;
  safeWrite(CORRECT_PATH, store);
  res.sendStatus(200);
});

app.post("/update-correct-answer", basicAuth, (req, res) => {
  const { round, question, answer } = req.body || {};
  const r = Number(round), q = Number(question);
  if (!Number.isFinite(r) || !Number.isFinite(q)) return res.status(400).send("bad payload");
  const store = safeRead(CORRECT_PATH, {});
  const keyR = `round_${r}`;
  const roundData = store[keyR] || {};
  roundData[`question_${q}`] = answer ?? "";
  store[keyR] = roundData;
  safeWrite(CORRECT_PATH, store);
  res.sendStatus(200);
});

// ---------- Admin: Runde/Status ----------
app.post("/current-round", basicAuth, (req, res) => {
  const prev = safeRead(ROUND_PATH, { round: 0, closed: false });
  const round = Number.isFinite(+req.body.round) ? +req.body.round : prev.round;
  const closed = typeof req.body.closed === "boolean" ? req.body.closed : prev.closed;
  safeWrite(ROUND_PATH, { round, closed });
  res.sendStatus(200);
});

// ---------- Register team (öffentlich) ----------
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

// ---------- Admin: Scores speichern ----------
app.post("/save-scores", basicAuth, (req, res) => {
  try {
    const payload = req.body && typeof req.body === "object" ? req.body : {};
    safeWrite(SCORES_PATH, payload);
    res.send("Gespeichert");
  } catch (e) {
    console.error("Fehler beim Speichern der Punkte:", e);
    res.status(500).send("Fehler");
  }
});

// ---------- Admin: Reset ----------
app.post("/reset-teams", basicAuth, (req, res) => {
  try {
    safeWrite(TEAMS_PATH, []);
    safeWrite(ANSWERS_PATH, {});
    safeWrite(SCORES_PATH, {});
    safeWrite(ROUND_PATH, { round: 0, closed: false });
    res.send("Zurückgesetzt");
  } catch (e) {
    console.error("Fehler beim Zurücksetzen:", e);
    res.status(500).send("Fehler beim Zurücksetzen");
  }
});

// ---------- Admin HTML schützen ----------
app.get("/admin.html", basicAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// ========== Token & Heartbeat ==========
app.post("/teams/get-or-assign-token", (req, res) => {
  const { teamName } = req.body || {};
  const name = String(teamName || "").trim();
  if (!name) return res.status(400).json({ error: "teamName required" });

  const db = safeRead(TEAM_TOKENS_PATH, { tokens:{}, byName:{} });
  let token = db.byName[name];
  if (!token) {
    token = randomTokenHex(24);
    db.byName[name] = token;
    db.tokens[token] = { teamName: name, lastSeen: Date.now(), pageHidden: false };
  } else {
    if (db.tokens[token]) db.tokens[token].lastSeen = Date.now();
    else db.tokens[token] = { teamName: name, lastSeen: Date.now(), pageHidden: false };
  }
  safeWrite(TEAM_TOKENS_PATH, db);
  res.json({ token });
});

app.get("/teams/rejoin", (req, res) => {
  const { token } = req.query || {};
  const db = safeRead(TEAM_TOKENS_PATH, { tokens:{}, byName:{} });
  const entry = db.tokens[token];
  if (!entry) return res.status(404).json({ error: "unknown token" });
  entry.lastSeen = Date.now();
  safeWrite(TEAM_TOKENS_PATH, db);
  res.json({ teamName: entry.teamName });
});

app.post("/teams/heartbeat", (req, res) => {
  const { token, pageHidden } = req.body || {};
  const db = safeRead(TEAM_TOKENS_PATH, { tokens:{}, byName:{} });
  const entry = db.tokens[token];
  if (!entry) return res.status(404).json({ error: "unknown token" });
  entry.lastSeen = Date.now();
  if (typeof pageHidden === "boolean") entry.pageHidden = pageHidden;
  safeWrite(TEAM_TOKENS_PATH, db);
  res.json({ ok: true });
});

// Admin-API: aktive Teams abfragen
app.get("/admin/active-teams", basicAuth, (req, res) => {
  const db = safeRead(TEAM_TOKENS_PATH, { tokens:{}, byName:{} });
  const now = Date.now();
  const out = [];
  for (const tok in db.tokens) {
    const t = db.tokens[tok];
    const diff = now - (t.lastSeen || 0);
    out.push({
      teamName: t.teamName,
      lastSeen: t.lastSeen,
      agoSec: Math.round(diff / 1000),
      active: diff < 30000,
      pageHidden: !!t.pageHidden
    });
  }
  res.json(out);
});

// ========== NEU: Team überall löschen ==========
app.post("/admin/remove-team", basicAuth, (req, res) => {
  const { teamName } = req.body || {};
  const name = String(teamName || "").trim();
  if (!name) return res.status(400).json({ error: "teamName required" });

  // 1) teams.json
  const teams = safeRead(TEAMS_PATH, []);
  const newTeams = teams.filter(t => t !== name);
  safeWrite(TEAMS_PATH, newTeams);

  // 2) teamTokens.json
  const tokDb = safeRead(TEAM_TOKENS_PATH, { tokens:{}, byName:{} });
  const token = tokDb.byName[name];
  if (token) {
    delete tokDb.byName[name];
    delete tokDb.tokens[token];
  }
  safeWrite(TEAM_TOKENS_PATH, tokDb);

  // 3) answers in allen Runden
  const answers = safeRead(ANSWERS_PATH, {});
  for (const k of Object.keys(answers)) {
    if (answers[k] && typeof answers[k] === "object") {
      if (answers[k][name]) delete answers[k][name];
    }
  }
  safeWrite(ANSWERS_PATH, answers);

  // 4) scores
  const scores = safeRead(SCORES_PATH, {});
  if (scores[name]) {
    delete scores[name];
    safeWrite(SCORES_PATH, scores);
  } else {
    // selbst wenn es keinen Score gab, write back um Konsistenz zu wahren
    safeWrite(SCORES_PATH, scores);
  }

  res.json({ ok: true, removed: name });
});

// Static
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

// Start
app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
});