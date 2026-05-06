const axios = require("axios");

const FLASK_BASE_URL =
  process.env.FLASK_BASE_URL ||
  process.env.FLASK_API_URL ||
  "http://localhost:5001";

async function rebuildStationZones(stations) {
  const response = await axios.post(
    `${FLASK_BASE_URL}/spatial/rebuild-station-zones`,
    { stations },
    {
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  return response.data;
}

async function fetchLatestStationZones() {
  const response = await axios.get(`${FLASK_BASE_URL}/spatial/station-zones/latest`);
  return response.data;
}

module.exports = {
  rebuildStationZones,
  fetchLatestStationZones,
};
