const express = require("express");
const fs = require("fs");
const path = require("path");
const app = express();
const PORT = 3000;

app.use(express.static("public"));
app.use(express.json());

const ANSWERS_PATH = path.join(__dirname, "data", "teamAnswers.json");
const CORRECT_PATH = path.join(__dirname, "data", "correctAnswers.json");
const ROUND_PATH = path.join(__dirname, "data", "currentRound.json");
const TEAMS_PATH = path.join(__dirname, "data", "teams.json");
const SCORES_PATH = path.join(__dirname, "data", "scores.json");

app.get("/data/teamAnswers.json", (req, res) => {
  fs.readFile(ANSWERS_PATH, "utf8", (err, data) => {
    if (err) return res.json({});
    res.send(data);
  });
});

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

app.get("/correct-answers", (req, res) => {
  fs.readFile(CORRECT_PATH, "utf8", (err, data) => {
    if (err) return res.json({});
    res.send(data);
  });
});

app.post("/save-correct-answers", (req, res) => {
  fs.readFile(CORRECT_PATH, "utf8", (err, data) => {
    const json = err ? {} : JSON.parse(data);
    json[`round_${req.body.round}`] = req.body.correctAnswers;
    fs.writeFile(CORRECT_PATH, JSON.stringify(json, null, 2), () => {
      res.sendStatus(200);
    });
  });
});

app.get("/current-round", (req, res) => {
  fs.readFile(ROUND_PATH, "utf8", (err, data) => {
    if (err) return res.json({ round: 0 });
    res.send(data);
  });
});

app.post("/current-round", (req, res) => {
  fs.writeFile(ROUND_PATH, JSON.stringify(req.body, null, 2), () => {
    res.sendStatus(200);
  });
});

app.get("/teams", (req, res) => {
  fs.readFile(TEAMS_PATH, "utf8", (err, data) => {
    if (err) return res.json([]);
    res.send(data);
  });
});

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

// Scores speichern
app.post("/save-scores", (req, res) => {
  fs.writeFile(SCORES_PATH, JSON.stringify(req.body, null, 2), (err) => {
    if (err) {
      console.error("Fehler beim Speichern der Punkte:", err);
      return res.status(500).send("Fehler");
    }
    res.send("Gespeichert");
  });
});

app.get("/scores", (req, res) => {
  fs.readFile(SCORES_PATH, "utf-8", (err, data) => {
    if (err) return res.json({});
    res.send(data);
  });
});

app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
});