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
    const json = err ? {} : JSON.parse(data);
    if (!json[`round_${round}`]) json[`round_${round}`] = {};
    if (!json[`round_${round}`][teamName]) {
      json[`round_${round}`][teamName] = {
        answers: answers,
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

// Korrekte Antworten speichern
app.post("/save-correct-answers", (req, res) => {
  fs.readFile(CORRECT_PATH, "utf8", (err, data) => {
    const json = err ? {} : JSON.parse(data);
    json[`round_${req.body.round}`] = req.body.correctAnswers;
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

// Aktuelle Runde setzen
app.post("/current-round", (req, res) => {
  fs.writeFile(ROUND_PATH, JSON.stringify(req.body, null, 2), () => {
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
    const json = err ? [] : JSON.parse(data);
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

// Punktestand speichern
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

// Server starten
app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
});