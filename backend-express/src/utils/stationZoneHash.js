const crypto = require("crypto");

function buildStationsHash(stations) {
  const normalized = [...stations]
    .map((s) => ({
      maHieu: String(s.maHieu ?? ""),
      vitri: String(s.vitri ?? ""),
      latitude: Number(s.latitude ?? 0),
      longitude: Number(s.longitude ?? 0),
    }))
    .sort((a, b) => a.maHieu.localeCompare(b.maHieu));

  const raw = JSON.stringify(normalized);
  return crypto.createHash("sha256").update(raw).digest("hex");
}

module.exports = {
  buildStationsHash,
};