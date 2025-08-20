const express = require("express");
const fs = require("fs");
const path = require("path");
const app = express();

// Für Render anpassbar: PORT von Umgebung oder 3000
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));
app.use(express.json());

// Pfade zu JSON-Dateien
const ANSWERS_PATH = path.join(__dirname, "data", "teamAnswers.json");
const CORRECT_PATH = path.join(__dirname, "data", "correctAnswers.json");
const ROUND_PATH = path.join(__dirname, "data", "currentRound.json");
const TEAMS_PATH = path.join(__dirname, "data", "teams.json");
const SCORES_PATH = path.join(__dirname, "data", "scores.json");

// Hilfsfunktion: Datei sicher lesen
function readJsonSafely(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

// ---------- Endpunkte ----------

// Team-Antworten abrufen
app.get("/data/teamAnswers.json", (req, res) => {
  fs.readFile(ANSWERS_PATH, "utf8", (err, data) => {
    if (err) return res.json({});
    res.send(data);
  });
});

// Team-Antworten absenden
app.post("/submit-answers", (req, res) => {
  const { teamName, answers, round } = req.body;

  fs.readFile(ANSWERS_PATH, "utf8", (err, data) => {
    const json = err ? {} : JSON.parse(data || "{}");
    const key = `round_${round}`;
    if (!json[key]) json[key] = {};
    if (!json[key][teamName]) {
      json[key][teamName] = {
        answers: Array.isArray(answers) ? answers : [],
        timestamp: Date.now(),
      };
      fs.writeFile(ANSWERS_PATH, JSON.stringify(json, null, 2), () => {
        res.sendStatus(200);
      });
    } else {
      res.sendStatus(409); // schon abgegeben
    }
  });
});

// Korrekte Antworten abrufen
app.get("/correct-answers", (req, res) => {
  fs.readFile(CORRECT_PATH, "utf8", (err, data) => {
    if (err) return res.json({});
    res.send(data);
  });
});

// Korrekte Antworten speichern (ganze Runde schreiben)
app.post("/save-correct-answers", (req, res) => {
  const { round, correctAnswers } = req.body;
  fs.readFile(CORRECT_PATH, "utf8", (err, data) => {
    const json = err ? {} : JSON.parse(data || "{}");
    json[`round_${round}`] = correctAnswers;
    fs.writeFile(CORRECT_PATH, JSON.stringify(json, null, 2), () => {
      res.sendStatus(200);
    });
  });
});

// Aktuelle Runde abrufen
app.get("/current-round", (req, res) => {
  fs.readFile(ROUND_PATH, "utf8", (err, data) => {
    if (err) return res.json({ round: 0 });
    res.send(data);
  });
});

// Aktuelle Runde setzen (optional: { round, closed })
app.post("/current-round", (req, res) => {
  const payload = {
    round: typeof req.body.round === "number" ? req.body.round : 0,
    closed: !!req.body.closed,
  };
  fs.writeFile(ROUND_PATH, JSON.stringify(payload, null, 2), () => {
    res.sendStatus(200);
  });
});

// Teams abrufen
app.get("/teams", (req, res) => {
  fs.readFile(TEAMS_PATH, "utf8", (err, data) => {
    if (err) return res.json([]);
    res.send(data);
  });
});

// Team registrieren
app.post("/register-team", (req, res) => {
  const { teamName } = req.body;
  fs.readFile(TEAMS_PATH, "utf8", (err, data) => {
    const json = err ? [] : JSON.parse(data || "[]");
    if (!json.includes(teamName)) {
      json.push(teamName);
      fs.writeFile(TEAMS_PATH, JSON.stringify(json, null, 2), () => {
        res.sendStatus(200);
      });
    } else {
      res.sendStatus(409); // Name schon vergeben
    }
  });
});

// Punktestand speichern (Gesamtranking-Objekt)
app.post("/save-scores", (req, res) => {
  fs.writeFile(SCORES_PATH, JSON.stringify(req.body, null, 2), (err) => {
    if (err) {
      console.error("Fehler beim Speichern der Punkte:", err);
      return res.status(500).send("Fehler");
    }
    res.send("Gespeichert");
  });
});

// Punktestand abrufen
app.get("/scores", (req, res) => {
  fs.readFile(SCORES_PATH, "utf-8", (err, data) => {
    if (err) return res.json({});
    res.send(data);
  });
});

// 🔥 Teams zurücksetzen (+ Abgaben & Scores leeren, Runde auf 0)
app.post("/reset-teams", (req, res) => {
  try {
    fs.writeFileSync(TEAMS_PATH, JSON.stringify([], null, 2));
    fs.writeFileSync(ANSWERS_PATH, JSON.stringify({}, null, 2));
    fs.writeFileSync(SCORES_PATH, JSON.stringify({}, null, 2));
    fs.writeFileSync(ROUND_PATH, JSON.stringify({ round: 0, closed: false }, null, 2));
    res.send("Teams, Antworten & Scores zurückgesetzt, Runde auf 0 gesetzt");
  } catch (err) {
    console.error("Fehler beim Zurücksetzen:", err);
    res.status(500).send("Fehler beim Zurücksetzen");
  }
});

// Server starten
app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
});