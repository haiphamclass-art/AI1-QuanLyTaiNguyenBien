const fs = require("fs");
const path = require("path");
const { Prediction } = require("../models");

const {
  rebuildStationZones,
  fetchLatestStationZones,
} = require("../services/stationZoneService");
const { buildStationsHash } = require("../utils/stationZoneHash");
const Area = require("../models/Area");

const METADATA_PATH = path.resolve(__dirname, "../../data/zone_metadata.json");
const LOCAL_WEB_CACHE_PATH = path.resolve(
  __dirname,
  "../../../backend-flask/data/output_influence/station_zones_latest_web.json"
);

function parsePossiblyNonStandardJson(raw) {
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (error) {
    const sanitized = raw
      .replace(/\bNaN\b/g, "null")
      .replace(/\bInfinity\b/g, "null")
      .replace(/\b-Infinity\b/g, "null");

    return JSON.parse(sanitized);
  }
}

function readMetadata() {
  try {
    if (!fs.existsSync(METADATA_PATH)) return {};
    const raw = fs.readFileSync(METADATA_PATH, "utf8");
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.error("readMetadata error:", error);
    return {};
  }
}

function writeMetadata(metadata) {
  try {
    fs.writeFileSync(METADATA_PATH, JSON.stringify(metadata, null, 2), "utf8");
  } catch (error) {
    console.error("writeMetadata error:", error);
  }
}

function readLocalGeojsonCache() {
  if (!fs.existsSync(LOCAL_WEB_CACHE_PATH)) return null;
  const raw = fs.readFileSync(LOCAL_WEB_CACHE_PATH, "utf8");
  return parsePossiblyNonStandardJson(raw);
}

async function getStationsFromDB() {
  const areas = await Area.findAll({
    attributes: ["id", "name", "latitude", "longitude", "area_type"],
    raw: true,
  });
  const latestPredictions = await Promise.all(
    areas.map(async (area) => {
      const prediction = await Prediction.findOne({
        where: { area_id: area.id },
        attributes: ["prediction_text", "createdAt"],
        order: [["createdAt", "DESC"]],
        raw: true,
      });

      return [area.id, prediction || null];
    })
  );

  const predictionMap = new Map(latestPredictions);

  const stations = areas.map((a) => ({
    maHieu: String(a.id),
    vitri: a.name,
    latitude: a.latitude,
    longitude: a.longitude,
    area_type: a.area_type,
    prediction_text: predictionMap.get(a.id)?.prediction_text ?? null,
    prediction_created_at: predictionMap.get(a.id)?.createdAt ?? null,
  }));

  return { areas, stations };
}

async function rebuildZones(req, res) {
  try {
    const { areas, stations } = await getStationsFromDB();

    const result = await rebuildStationZones(stations);

    const currentHash = buildStationsHash(stations);
    writeMetadata({
      stationsHash: currentHash,
      stationCount: stations.length,
      lastBuiltAt: new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      areaCount: areas.length,
      data: result,
    });
  } catch (error) {
    console.error("rebuildZones error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

async function getLatestZones(req, res) {
  try {
    const { stations } = await getStationsFromDB();
    const currentHash = buildStationsHash(stations);

    const metadata = readMetadata();

    const needRebuild =
      !metadata?.stationsHash || metadata.stationsHash !== currentHash;

    if (needRebuild) {
      console.log("Station zones outdated or missing -> rebuilding...");
      await rebuildStationZones(stations);

      writeMetadata({
        stationsHash: currentHash,
        stationCount: stations.length,
        lastBuiltAt: new Date().toISOString(),
      });
    } else {
      console.log("Station zones up-to-date -> using cached geojson via Flask");
    }

    let geojson;

    try {
      geojson = await fetchLatestStationZones();
    } catch (error) {
      const canUseLocalCache =
        (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") &&
        fs.existsSync(LOCAL_WEB_CACHE_PATH);

      if (canUseLocalCache) {
        console.log("Flask station-zones cache unavailable -> using local web cache");
        geojson = readLocalGeojsonCache();
      }

      if (geojson) {
        return res.status(200).json(geojson);
      }

      if (error.response?.status !== 404 || needRebuild) {
        throw error;
      }

      console.log("Station zones cache missing on Flask -> rebuilding...");
      await rebuildStationZones(stations);

      writeMetadata({
        stationsHash: currentHash,
        stationCount: stations.length,
        lastBuiltAt: new Date().toISOString(),
      });

      geojson = await fetchLatestStationZones();
    }

    return res.status(200).json(geojson);
  } catch (error) {
    console.error("getLatestZones error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

module.exports = {
  rebuildZones,
  getLatestZones,
};
